FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/app/backend:/app:/app/shared/python

WORKDIR /app

COPY backend/requirements.txt /tmp/backend-requirements.txt
COPY collector/requirements.txt /tmp/collector-requirements.txt
COPY tests/requirements.txt /tmp/test-requirements.txt
RUN pip install --no-cache-dir \
    -r /tmp/backend-requirements.txt \
    -r /tmp/collector-requirements.txt \
    -r /tmp/test-requirements.txt

COPY shared /app/shared
COPY backend /app/backend
COPY collector /app/collector
COPY tests /app/tests

CMD ["pytest", "-q", "tests"]
