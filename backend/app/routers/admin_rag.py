"""Admin-only RAG ingestion router.

This router accepts knowledge documents from the project owner and stores the
resulting chunks and embeddings in the global RAG knowledge base.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Literal

from dotenv import load_dotenv
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status

from app.middleware.auth import get_current_user
from app.services.document_upload import upload_document


ENV_PATH = Path(__file__).resolve().parents[2] / ".env"
load_dotenv(dotenv_path=ENV_PATH)

router = APIRouter(tags=["admin-rag"])


def _get_admin_email() -> str:
	"""Return the configured admin email address."""

	admin_email = os.getenv("ADMIN_EMAIL")
	if not admin_email:
		raise HTTPException(
			status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
			detail="ADMIN_EMAIL is not configured",
		)
	return admin_email.strip()


@router.post("/admin/upload-doc")
async def upload_admin_document(
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
	"""Upload and index an admin knowledge document into the RAG store."""

	admin_email = _get_admin_email()
	uploader_email = (current_user.get("email") or "").strip()
	if uploader_email != admin_email:
		raise HTTPException(
			status_code=status.HTTP_403_FORBIDDEN,
			detail="You are not allowed to upload knowledge documents",
		)

	return await upload_document(
		file=file,
		ticker=ticker,
		company=company,
		document_type=document_type,
		source="admin_doc",
		user_id=None,
	)