FROM python:3.12-slim
WORKDIR /app
COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ ./
COPY src/data/reference /reference
ENV MF_REFERENCE_DIR=/reference \
    MF_STATIC_SNAPSHOT_DIR=/app/snapshot
EXPOSE 8000
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.api:app --host 0.0.0.0 --port 8000"]
