#!/usr/bin/env bash
set -euo pipefail

MODE=${1:-}
ACTION=${2:-}
MESSAGE=${3:-}

if [[ -z "$MODE" || -z "$ACTION" ]]; then
  echo "Uso: scripts/manage.sh dev|prod migrate|build-frontend|revision|admin-create|status [mensaje]"
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ "$MODE" == "dev" ]]; then
  COMPOSE=(docker compose -f "$ROOT_DIR/docker-compose.yml")
elif [[ "$MODE" == "prod" ]]; then
  COMPOSE=(docker compose -f "$ROOT_DIR/docker-compose.prod.yml")
else
  echo "Modo inválido: $MODE"
  exit 1
fi

ensure_backend_running() {
  local running
  running=$("${COMPOSE[@]}" ps --services --filter "status=running" | grep -x "backend" || true)
  if [[ -z "$running" ]]; then
    echo "El servicio backend no está activo. Ejecuta deploy primero."
    exit 1
  fi
}

ensure_frontend_running() {
  local running
  running=$("${COMPOSE[@]}" ps --services --filter "status=running" | grep -x "frontend" || true)
  if [[ -z "$running" ]]; then
    echo "El servicio frontend no está activo. Ejecuta deploy primero."
    exit 1
  fi
}

case "$ACTION" in
  migrate)
    ensure_backend_running
    "${COMPOSE[@]}" exec backend alembic upgrade head
    ;;
  revision)
    if [[ -z "$MESSAGE" ]]; then
      echo "Uso: scripts/manage.sh $MODE revision \"mensaje\""
      exit 1
    fi
    ensure_backend_running
    "${COMPOSE[@]}" exec backend alembic revision --autogenerate -m "$MESSAGE"
    ;;
  build-frontend)
    ensure_frontend_running
    "${COMPOSE[@]}" exec frontend npm run build
    ;;
  admin-create)
    ensure_backend_running
    "${COMPOSE[@]}" exec backend flask create-admin
    ;;
  status)
    "${COMPOSE[@]}" ps
    ;;
  *)
    echo "Acción inválida: $ACTION"
    echo "Uso: scripts/manage.sh dev|prod migrate|build-frontend|revision|admin-create|status [mensaje]"
    exit 1
    ;;
esac
