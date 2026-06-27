"""Authenticated user RAG ingestion router.

This router allows any authenticated user to upload personal knowledge
documents that are isolated per user during retrieval.
"""

from __future__ import annotations

import asyncio
from typing import Literal

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from pydantic import BaseModel, Field

from app.middleware.auth import get_current_user
from app.rag import embeddings, rag_service
from app.services.gemini import get_user_doc_answer
from app.services.document_upload import upload_document


router = APIRouter(tags=["user-rag"])


class AskAiRequest(BaseModel):
	question: str = Field(min_length=1)
	ticker: str | None = None


class AskAiResponse(BaseModel):
	answer: str
	sources: list[dict]
	chunks_used: int


def _get_user_id(current_user: dict) -> str:
	"""Return the authenticated user's id as a string."""

	user_id = current_user.get("id") or current_user.get("_id")
	if user_id is None:
		raise HTTPException(
			status_code=status.HTTP_401_UNAUTHORIZED,
			detail="Missing or invalid token",
		)
	return str(user_id)


def _normalize_ticker(ticker: str | None) -> str | None:
	"""Normalize an optional ticker filter."""

	if ticker is None:
		return None

	normalized_ticker = ticker.strip().upper()
	return normalized_ticker or None


@router.post("/user/upload-doc")
async def upload_user_document(
	file: UploadFile = File(...),
	ticker: str = Form(...),
	company: str = Form(...),
	document_type: Literal[
		"annual_report",
		"quarterly_report",
		"earnings_call",
		"presentation",
		"faq",
		"policy",
	] = Form(...),
	current_user: dict = Depends(get_current_user),
) -> dict:
	"""Upload and index a user-owned knowledge document into the shared RAG store."""

	user_id = _get_user_id(current_user)
	result = await upload_document(
		file=file,
		ticker=ticker,
		company=company,
		document_type=document_type,
		source="user_doc",
		user_id=user_id,
	)

	return {
		"success": bool(result.get("success", True)),
		"ticker": result.get("ticker", ticker),
		"document_type": result.get("document_type", document_type),
		"chunks_stored": int(result.get("chunks_stored", 0)),
	}


@router.post("/user/ask-ai", response_model=AskAiResponse)
async def ask_user_documents(
	payload: AskAiRequest,
	current_user: dict = Depends(get_current_user),
) -> dict:
	"""Retrieve the authenticated user's document chunks for a question."""

	user_id = _get_user_id(current_user)
	question = payload.question.strip()
	if not question:
		raise HTTPException(
			status_code=status.HTTP_400_BAD_REQUEST,
			detail="Question cannot be empty",
		)

	query_ticker = _normalize_ticker(payload.ticker)

	try:
		query_embedding = await asyncio.to_thread(embeddings.embed_query, question)
		retrieved_chunks = await asyncio.to_thread(
			rag_service.retrieve_user_doc_context,
			query_embedding,
			user_id,
			[query_ticker] if query_ticker else None,
		)
	except HTTPException:
		raise
	except Exception as exc:  # pragma: no cover - surfaced as API error in production
		raise HTTPException(
			status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
			detail="Failed to retrieve user document context",
		) from exc

	if not retrieved_chunks:
		return {
			"answer": "The uploaded documents do not contain enough information to answer this question.",
			"sources": [],
			"chunks_used": 0,
		}

	answer = await asyncio.to_thread(get_user_doc_answer, question, retrieved_chunks)

	sources = [
		{
			"ticker": chunk.get("ticker"),
			"company": chunk.get("company"),
			"doc_name": chunk.get("doc_name"),
			"document_type": chunk.get("document_type"),
			"chunk_index": chunk.get("chunk_index"),
			"score": chunk.get("score"),
		}
		for chunk in retrieved_chunks
	]

	return {
		"answer": answer,
		"sources": sources,
		"chunks_used": len(retrieved_chunks),
	}