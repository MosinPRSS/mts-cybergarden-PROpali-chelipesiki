FROM python:3.14-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    GRPC_PORT=50051

WORKDIR /app

COPY ai/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY proto/generate.proto /tmp/proto/generate.proto
RUN python -m grpc_tools.protoc -I /tmp/proto \
    --python_out=/app --grpc_python_out=/app /tmp/proto/generate.proto

COPY ai/main.py ai/healthcheck.py ai/deepseek.py ai/summary.py ai/dashboard.py ./

USER 10001:10001
EXPOSE 50051

CMD ["python", "main.py"]
