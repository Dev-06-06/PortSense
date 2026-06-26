"""Shared document upload workflow for PortSense ingestion."""

from __future__ import annotations

import asyncio
from io import BytesIO
from pathlib import Path
from uuid import uuid4

from fastapi import HTTPException, UploadFile, status

from app.rag import chunker, embeddings, rag_service


SUPPORTED_DOCUMENT_TYPES = {
	"annual_report",
	"quarterly_report",
	"earnings_call",
	"presentation",
	"faq",
	"policy",
}
SUPPORTED_FILE_TYPES = {".pdf", ".txt"}
MAX_UPLOAD_SIZE_BYTES = 20 * 1024 * 1024


def _extract_pdf_text(file_bytes: bytes) -> str:
	"""Extract plain text from a PDF document using pdfplumber."""

	try:
		import pdfplumber
	except ModuleNotFoundError as exc:  # pragma: no cover - environment dependent
		raise HTTPException(
			status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
			detail="pdfplumber is not installed",
		) from exc

	with pdfplumber.open(BytesIO(file_bytes)) as pdf:
		pages = [page.extract_text() or "" for page in pdf.pages]

	return "\n\n".join(page.strip() for page in pages if page and page.strip()).strip()


def _extract_txt_text(file_bytes: bytes) -> str:
	"""Decode a UTF-8 text document into a string."""

	try:
		return file_bytes.decode("utf-8").strip()
	except UnicodeDecodeError as exc:
		raise HTTPException(
			status_code=status.HTTP_400_BAD_REQUEST,
			detail="Text files must be UTF-8 encoded",
		) from exc


async def upload_document(
	file: UploadFile,
	ticker: str,
	company: str,
	document_type: str,
	source: str,
	user_id: str | None = None,
) -> dict:
	"""Validate, chunk, embed, and store a document upload."""

	if document_type not in SUPPORTED_DOCUMENT_TYPES:
		raise HTTPException(
			status_code=status.HTTP_400_BAD_REQUEST,
			detail="Unsupported document type",
		)

	file_name = file.filename or ""
	file_extension = Path(file_name).suffix.lower()
	if file_extension not in SUPPORTED_FILE_TYPES:
		raise HTTPException(
			status_code=status.HTTP_400_BAD_REQUEST,
			detail="Unsupported file type",
		)

	file_bytes = await file.read()
	if len(file_bytes) > MAX_UPLOAD_SIZE_BYTES:
		raise HTTPException(
			status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
			detail="File larger than 20 MB",
		)

	doc_id = str(uuid4())
	if file_extension == ".pdf":
		text = await asyncio.to_thread(_extract_pdf_text, file_bytes)
	else:
		text = _extract_txt_text(file_bytes)

	if not text.strip():
		raise HTTPException(
			status_code=status.HTTP_400_BAD_REQUEST,
			detail="Extracted document text is empty",
		)

	chunks = chunker.chunk_text(
		text=text,
		doc_id=doc_id,
		ticker=ticker,
		company=company,
		doc_name=file_name,
		document_type=document_type,
		source=source,
		user_id=user_id,
	)

	try:
		embedding_vectors = await asyncio.to_thread(
			embeddings.embed_texts,
			[chunk["text"] for chunk in chunks],
		)
	except HTTPException:
		raise
	except Exception as exc:  # pragma: no cover - service exceptions are surfaced as HTTP errors
		raise HTTPException(
			status_code=status.HTTP_502_BAD_GATEWAY,
			detail="Embedding generation failed",
		) from exc

	try:
		await asyncio.to_thread(rag_service.store_doc_chunks, chunks, embedding_vectors)
	except HTTPException:
		raise
	except Exception as exc:  # pragma: no cover - storage exceptions are surfaced as HTTP errors
		raise HTTPException(
			status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
			detail="Failed to store document chunks",
		) from exc

	return {
		"success": True,
		"message": "Document indexed successfully.",
		"doc_id": doc_id,
		"ticker": ticker,
		"company": company,
		"document_type": document_type,
		"chunks_stored": len(chunks),
	}