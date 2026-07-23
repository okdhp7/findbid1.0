FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/app:/app/shared/python

WORKDIR /app
COPY document_worker/requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt \
    && useradd --create-home --uid 10003 findbid

COPY --chown=findbid:findbid shared/python /app/shared/python
COPY --chown=findbid:findbid document_worker /app/document_worker

USER findbid
CMD ["python", "-m", "document_worker.main"]
