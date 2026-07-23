FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/app:/app/shared/python

WORKDIR /app
COPY collector/requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt \
    && useradd --create-home --uid 10002 findbid

COPY --chown=findbid:findbid shared/python /app/shared/python
COPY --chown=findbid:findbid collector /app/collector

USER findbid
CMD ["python", "-m", "collector.main"]
