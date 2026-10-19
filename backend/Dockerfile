# syntax=docker/dockerfile:1.7
FROM ghcr.io/astral-sh/uv:0.11.3 AS uv
FROM python:3.13.16-slim
COPY --from=uv /uv /uvx /bin/
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 \
    UV_PROJECT_ENVIRONMENT=/opt/venv \
    UV_LINK_MODE=copy \
    PATH="/opt/venv/bin:$PATH"
WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv uv sync --locked --all-groups
COPY . .
RUN mkdir -p /app/media
EXPOSE 8000
CMD ["python", "manage.py", "runserver", "0.0.0.0:8000"]
