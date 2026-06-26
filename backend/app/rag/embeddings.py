"""Embedding helpers for PortSense RAG flows.

This module keeps Gemini embedding access stateless and exposes a minimal
FastAPI-friendly wrapper around the Google GenAI SDK.
"""

from __future__ import annotations

import os

from fastapi import HTTPException
from google import genai
from google.genai import types

EMBEDDING_MODEL = os.getenv("GEMINI_EMBEDDING_MODEL", "gemini-embedding-001")
EMBEDDING_DIMENSIONS = int(os.getenv("GEMINI_EMBEDDING_DIMENSIONS", "768"))
OUTPUT_DIMENSIONALITY = 768


def _get_client() -> genai.Client:
    """Create a Gemini client from the configured API key."""

    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY is not configured")

    return genai.Client(api_key=api_key)


def _validate_embedding_dimensions(embedding: list[float], expected_dimensions: int) -> None:
    """Ensure the embedding length matches the expected dimensionality."""

    if len(embedding) != expected_dimensions:
        raise HTTPException(status_code=500, detail="Gemini returned an embedding with an unexpected dimension")


def _normalize_embedding_values(values: object) -> list[float]:
    """Convert Gemini embedding values to a list of floats."""

    if values is None:
        return []

    return [float(value) for value in values]


def embed_texts(texts: list[str]) -> list[list[float]]:
    """Embed a batch of documents for retrieval.

    Args:
        texts: Texts to embed.

    Returns:
        A list of embedding vectors in the same order as the input texts.

    Raises:
        HTTPException: If the Gemini API fails or returns invalid dimensions.
    """

    if not texts:
        return []

    client = _get_client()

    try:
        response = client.models.embed_content(
            model=EMBEDDING_MODEL,
            contents=texts,
            config=types.EmbedContentConfig(
                task_type="RETRIEVAL_DOCUMENT",
                output_dimensionality=OUTPUT_DIMENSIONALITY,
            ),
        )
    except Exception as exc:  # pragma: no cover - exercised through API failures in production
        raise HTTPException(status_code=502, detail="Gemini embedding request failed") from exc

    embeddings = getattr(response, "embeddings", None)
    if embeddings is None or len(embeddings) != len(texts):
        raise HTTPException(status_code=500, detail="Gemini returned an unexpected number of embeddings")

    vectors: list[list[float]] = []
    expected_dimensions = EMBEDDING_DIMENSIONS

    for embedding in embeddings:
        vector = _normalize_embedding_values(getattr(embedding, "values", None))
        _validate_embedding_dimensions(vector, expected_dimensions)
        vectors.append(vector)

    return vectors


def embed_query(text: str) -> list[float]:
    """Embed a retrieval query.

    Args:
        text: Query text to embed.

    Returns:
        The embedding vector for the query.

    Raises:
        HTTPException: If the Gemini API fails or returns invalid dimensions.
    """

    client = _get_client()

    try:
        response = client.models.embed_content(
            model=EMBEDDING_MODEL,
            contents=text,
            config=types.EmbedContentConfig(
                task_type="RETRIEVAL_QUERY",
                output_dimensionality=OUTPUT_DIMENSIONALITY,
            ),
        )
    except Exception as exc:  # pragma: no cover - exercised through API failures in production
        raise HTTPException(status_code=502, detail="Gemini embedding request failed") from exc

    embeddings = getattr(response, "embeddings", None)
    if not embeddings:
        raise HTTPException(status_code=500, detail="Gemini returned no embedding")

    vector = _normalize_embedding_values(getattr(embeddings[0], "values", None))
    _validate_embedding_dimensions(vector, EMBEDDING_DIMENSIONS)
    return vector