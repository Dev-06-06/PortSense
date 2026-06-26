"""Background embedding helpers for enriched GNews articles."""

from __future__ import annotations

from datetime import datetime, timezone
from hashlib import md5
from typing import Any

from app.rag import embeddings, rag_service


def _build_embedding_text(article: dict[str, Any]) -> str:
    """Build the retrieval text for a single enriched article."""

    parts: list[str] = []

    company = str(article.get("company", "") or "").strip()
    if company:
        parts.append(f"Company: {company}")

    title = str(article.get("title", "") or "").strip()
    if title:
        parts.extend(["Title:", title])

    description = article.get("description")
    if description is not None:
        description_text = str(description).strip()
        if description_text:
            parts.extend(["Description:", description_text])

    content = article.get("content")
    if content is not None:
        content_text = str(content).strip()
        if content_text:
            parts.extend(["Content:", content_text])

    return "\n\n".join(parts)


def embed_and_store_articles(articles: list[dict]) -> None:
    """Embed enriched GNews articles and store them in the RAG collection."""

    if not articles:
        return

    created_at = datetime.now(timezone.utc)
    prepared_articles: list[dict[str, Any]] = []
    texts: list[str] = []

    for article in articles:
        text = _build_embedding_text(article)
        if not text:
            continue

        url = str(article["url"]).strip()
        prepared_articles.append({
            "article": article,
            "text": text,
            "url_hash": md5(url.encode("utf-8")).hexdigest(),
        })
        texts.append(text)

    if not prepared_articles:
        return

    vectors = embeddings.embed_texts(texts)

    for item, embedding in zip(prepared_articles, vectors):
        article = item["article"]
        document = {
            "ticker": article["ticker"],
            "company": article["company"],
            "title": article["title"],
            "description": article.get("description"),
            "content": article.get("content"),
            "publisher": article["publisher"],
            "url": article["url"],
            "url_hash": item["url_hash"],
            "published_at": article["published_at"],
            "created_at": created_at,
            "sentiment": article["sentiment"],
            "sentiment_score": article["sentiment_score"],
            "source": "gnews",
            "text": item["text"],
        }
        rag_service.store_news_article(document, embedding)