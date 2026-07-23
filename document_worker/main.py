from __future__ import annotations

import json
import logging
import tempfile
from pathlib import Path

import httpx
from redis import Redis

from document_worker.chunkers import chunk_text
from document_worker.embeddings import create_local_embedding
from document_worker.extractors import extract_text
from findbid_shared.config import get_settings

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
logger = logging.getLogger("document-worker")


def download_document(url: str, filename: str) -> Path:
    target = Path(tempfile.gettempdir()) / filename
    with httpx.stream("GET", url, timeout=60, follow_redirects=True) as response:
        response.raise_for_status()
        with target.open("wb") as output:
            for chunk in response.iter_bytes():
                output.write(chunk)
    return target


def process_job(job: dict) -> dict:
    path = download_document(job["url"], job.get("filename", "attachment.pdf"))
    try:
        text = extract_text(path)
        chunks = chunk_text(text)
        return {
            "bidId": job["bidId"],
            "documentId": job["documentId"],
            "status": "완료",
            "textLength": len(text),
            "chunks": [
                {"index": index, "text": chunk, "embedding": create_local_embedding(chunk)}
                for index, chunk in enumerate(chunks)
            ],
        }
    finally:
        path.unlink(missing_ok=True)


def main() -> None:
    settings = get_settings()
    redis = Redis.from_url(settings.redis_url, decode_responses=True)
    logger.info("문서 처리 워커가 작업을 기다리고 있습니다.")
    while True:
        message = redis.brpop("document_jobs", timeout=5)
        if not message:
            continue
        _, raw_job = message
        job = json.loads(raw_job)
        try:
            result = process_job(job)
        except Exception as error:
            logger.exception("문서 처리 중 오류가 발생했습니다.")
            result = {
                "bidId": job.get("bidId"),
                "documentId": job.get("documentId"),
                "status": "실패",
                "error": str(error),
            }
        redis.set(f"document_result:{job.get('documentId')}", json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
