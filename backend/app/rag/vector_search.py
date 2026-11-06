"""MongoDB Atlas Vector Search helpers for PortSense RAG.

This module only stores precomputed embeddings and retrieves context through
Atlas Vector Search. It does not generate embeddings or chunk text.
"""

from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from functools import lru_cache
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from pymongo import MongoClient
from pymongo.errors import BulkWriteError, DuplicateKeyError


ENV_PATH = Path(__file__).resolve().parents[2] / ".env"
load_dotenv(dotenv_path=ENV_PATH)

DEFAULT_RAG_DB = "portsense_rag"
DEFAULT_RAG_COLLECTION = "rag_documents"
VECTOR_SEARCH_INDEX = "rag_vector_index"
EMBEDDING_FIELD = "embedding"
EMBEDDING_DIMENSIONS = 768
_DUPLICATE_ERROR_CODES = {11000, 11001, 12582}


def _get_env(name: str, default: str | None = None) -> str:
	"""Read a required or optional environment variable."""

	value = os.getenv(name, default)
	if value is None or not value.strip():
		raise ValueError(f"{name} is not set")
	return value.strip()


@lru_cache(maxsize=1)
def _get_client() -> MongoClient:
	"""Create a shared PyMongo client."""

	mongo_uri = _get_env("MONGO_URI")
	return MongoClient(mongo_uri)


def _get_collection():
	"""Return the configured RAG collection."""

	database_name = _get_env("RAG_DB", DEFAULT_RAG_DB)
	collection_name = _get_env("RAG_COLLECTION", DEFAULT_RAG_COLLECTION)
	return _get_client()[database_name][collection_name]


def _normalize_embedding(embedding: list[float]) -> list[float]:
	"""Convert an embedding to a float list and validate its length."""

	vector = [float(value) for value in embedding]
	if len(vector) != EMBEDDING_DIMENSIONS:
		raise ValueError(f"embedding must have {EMBEDDING_DIMENSIONS} dimensions")
	return vector


def _normalize_tickers(tickers: list[str] | None) -> list[str] | None:
	"""Normalize an optional ticker filter."""

	if not tickers:
		return None

	normalized = [ticker.strip().upper() for ticker in tickers if ticker and ticker.strip()]
	return normalized or None


def _build_vector_filter(
	user_id: str | None,
	tickers: list[str] | None,
	sources: list[str] | None = None,
) -> dict[str, Any]:
	"""Build the Atlas Vector Search filter for supported document sources."""

	normalized_user_id = str(user_id).strip() if user_id is not None else ""

	if sources is None:
		source_filters: list[dict[str, Any]] = [
			{"source": "admin_doc"},
			{
				"source": "gnews",
				"published_at": {"$gte": datetime.now(timezone.utc) - timedelta(days=365)},
			},
		]

		if normalized_user_id:
			source_filters.append({"source": "user_doc", "user_id": normalized_user_id})
	else:
		normalized_sources = [str(source).strip() for source in sources if str(source).strip()]
		source_filters = []

		for source in normalized_sources:
			if source == "user_doc":
				user_doc_filter: dict[str, Any] = {"source": "user_doc"}
				if normalized_user_id:
					user_doc_filter["user_id"] = normalized_user_id
				source_filters.append(user_doc_filter)
			elif source == "gnews":
				source_filters.append(
					{
						"source": "gnews",
						"published_at": {"$gte": datetime.now(timezone.utc) - timedelta(days=365)},
					}
				)
			else:
				source_filters.append({"source": source})

		if not source_filters:
			source_filters.append({"source": "user_doc"})

	filter_query: dict[str, Any] = {"$or": source_filters}

	normalized_tickers = _normalize_tickers(tickers)
	if normalized_tickers:
		filter_query = {"$and": [filter_query, {"ticker": {"$in": normalized_tickers}}]}

	return filter_query


def store_doc_chunks(chunks: list[dict], embeddings: list[list[float]]) -> None:
	"""Store document chunks and their embeddings in MongoDB."""

	if len(chunks) != len(embeddings):
		raise ValueError("chunks and embeddings must have the same length")

	if not chunks:
		return

	collection = _get_collection()
	documents: list[dict[str, Any]] = []

	for chunk, embedding in zip(chunks, embeddings):
		document = dict(chunk)
		document[EMBEDDING_FIELD] = _normalize_embedding(embedding)
		documents.append(document)

	try:
		collection.insert_many(documents, ordered=False)
	except BulkWriteError as exc:
		details = exc.details or {}
		write_errors = details.get("writeErrors", [])
		write_concern_errors = details.get("writeConcernErrors", [])
		if (
			write_errors
			and not write_concern_errors
			and all(error.get("code") in _DUPLICATE_ERROR_CODES for error in write_errors)
		):
			return
		raise


def store_news_article(article: dict, embedding: list[float]) -> None:
	"""Store or update a single GNews article by URL hash."""

	if "url_hash" not in article:
		raise ValueError("article must include url_hash")

	collection = _get_collection()
	document = dict(article)
	document[EMBEDDING_FIELD] = _normalize_embedding(embedding)
	url_hash = document["url_hash"]

	try:
		collection.update_one({"url_hash": url_hash}, {"$set": document}, upsert=True)
	except DuplicateKeyError:
		collection.update_one({"url_hash": url_hash}, {"$set": document}, upsert=False)


def retrieve_context(
	query_embedding: list[float],
	user_id: str | None,
	tickers: list[str] | None,
	limit: int = 8,
	sources: list[str] | None = None,
) -> list[dict]:
	"""Retrieve semantically relevant context with Atlas Vector Search."""

	if limit < 1:
		raise ValueError("limit must be positive")

	collection = _get_collection()
	pipeline = [
		{
			"$vectorSearch": {
				"index": VECTOR_SEARCH_INDEX,
				"path": EMBEDDING_FIELD,
				"queryVector": _normalize_embedding(query_embedding),
				"numCandidates": 100,
				"limit": limit,
				"filter": _build_vector_filter(user_id, tickers, sources=sources),
			}
		},
		{
			"$project": {
				"_id": 0,
				"text": 1,
				"source": 1,
				"user_id": 1,
				"ticker": 1,
				"company": 1,
				"document_type": 1,
				"doc_name": 1,
				"title": 1,
				"publisher": 1,
				"published_at": 1,
				"sentiment": 1,
				"chunk_index": 1,
				"page": 1,
				"score": {"$meta": "vectorSearchScore"},
			}
		},
		{"$sort": {"score": -1}},
	]

	return list(collection.aggregate(pipeline))


def retrieve_user_doc_context(
	query_embedding: list[float],
	user_id: str,
	tickers: list[str] | None,
	limit: int = 8,
) -> list[dict]:
	"""Retrieve only the authenticated user's uploaded document chunks."""

	return retrieve_context(
		query_embedding=query_embedding,
		user_id=user_id,
		tickers=tickers,
		limit=limit,
		sources=["user_doc"],
	)
