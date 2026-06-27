"""Text chunking helpers for PortSense RAG ingestion.

This module only splits extracted document text into overlapping word chunks
and attaches metadata. It intentionally does not perform embedding or MongoDB
operations.
"""

from __future__ import annotations

import re
from datetime import datetime, timezone


CHUNK_SIZE = 500
OVERLAP = 50


def _split_paragraphs(text: str) -> list[str]:
	"""Split text into non-empty paragraphs while preserving order."""

	paragraphs = [paragraph.strip() for paragraph in re.split(r"\n\s*\n+", text)]
	return [paragraph for paragraph in paragraphs if paragraph]


def _split_words(text: str) -> list[str]:
	"""Split text into approximate word tokens."""

	return text.split()


def _count_words(paragraphs: list[str]) -> int:
	"""Count words across a list of paragraphs."""

	return sum(len(_split_words(paragraph)) for paragraph in paragraphs)


def _build_chunk(paragraphs: list[str]) -> str:
	"""Reconstruct chunk text from paragraph strings."""

	return "\n\n".join(paragraph.strip() for paragraph in paragraphs if paragraph).strip()


def _flush_chunk(chunks: list[str], current_paragraphs: list[str]) -> None:
	"""Append the current chunk if it contains any text."""

	if current_paragraphs:
		chunks.append(_build_chunk(current_paragraphs))
		current_paragraphs.clear()


def _split_long_paragraph(paragraph: str, chunks: list[str]) -> None:
	"""Split a paragraph longer than the target size with overlap."""

	words = _split_words(paragraph)
	if not words:
		return

	start = 0
	while start < len(words):
		end = min(start + CHUNK_SIZE, len(words))
		chunk_text = _build_chunk(words[start:end])
		if chunk_text:
			chunks.append(chunk_text)
		if end >= len(words):
			break
		start = max(end - OVERLAP, start + 1)


def chunk_text(
	text: str,
	doc_id: str,
	ticker: str,
	company: str,
	doc_name: str,
	document_type: str,
	source: str,
	user_id: str | None = None,
) -> list[dict]:
	"""Split text into overlapping word chunks with metadata."""

	if not text or not text.strip():
		raise ValueError("text cannot be empty or whitespace only")

	paragraphs = _split_paragraphs(text)
	chunk_texts: list[str] = []
	current_paragraphs: list[str] = []

	for paragraph in paragraphs:
		paragraph_words = _split_words(paragraph)
		if not paragraph_words:
			continue

		if len(paragraph_words) > CHUNK_SIZE:
			_flush_chunk(chunk_texts, current_paragraphs)
			_split_long_paragraph(paragraph, chunk_texts)
			continue

		if current_paragraphs and _count_words(current_paragraphs) + len(paragraph_words) > CHUNK_SIZE:
			_flush_chunk(chunk_texts, current_paragraphs)

		current_paragraphs.append(paragraph)

	_flush_chunk(chunk_texts, current_paragraphs)

	total_chunks = len(chunk_texts)
	created_at = datetime.now(timezone.utc)
	normalized_user_id = str(user_id).strip() if user_id is not None else None
	uploaded_by = "admin" if source == "admin_doc" else normalized_user_id

	chunks: list[dict] = []
	for chunk_index, chunk in enumerate(chunk_texts):
		chunks.append(
			{
				"text": chunk,
				"doc_id": doc_id,
				"doc_name": doc_name,
				"document_type": document_type,
				"ticker": ticker,
				"company": company,
				"source": source,
				"user_id": normalized_user_id,
				"chunk_index": chunk_index,
				"total_chunks": total_chunks,
				"created_at": created_at,
				"uploaded_by": uploaded_by,
			}
		)

	return chunks
