FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8000

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY document_detection_engine ./document_detection_engine
COPY orchestration_layer ./orchestration_layer

EXPOSE 8000

# Default: run the orchestration layer (which calls the detection engine)
CMD ["uvicorn", "orchestration_layer.app:app", "--host", "0.0.0.0", "--port", "8000"]
