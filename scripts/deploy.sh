#!/usr/bin/env bash
set -euo pipefail

MODE=${1:-}
ACTION=${2:-up}

if [[ -z "$MODE" ]]; then
  echo "Uso: scripts/deploy.sh dev|prod [down]"
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

load_env() {
  if [[ -f "$ROOT_DIR/.env" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "$ROOT_DIR/.env"
    set +a
  fi
}

compose_up() {
  local compose_file="$1"
  shift
  docker compose -f "$compose_file" up -d --build \
    --scale worker-audio=${WORKERS_AUDIO:-1} \
    --scale worker-transcribe=${WORKERS_TRANSCRIBE:-1} \
    --scale worker-photos=${WORKERS_PHOTO:-1} \
    --scale worker-llm=${WORKERS_LLM:-1} \
    "$@"
}

case "$MODE" in
  dev)
    if [[ "$ACTION" == "down" ]]; then
      docker compose -f "$ROOT_DIR/docker-compose.yml" down
      exit 0
    fi

    if [[ ! -f "$ROOT_DIR/.env" && -f "$ROOT_DIR/env.example" ]]; then
      cp "$ROOT_DIR/env.example" "$ROOT_DIR/.env"
    fi

    load_env
    compose_up "$ROOT_DIR/docker-compose.yml"

    "$ROOT_DIR/scripts/manage.sh" dev migrate
    ;;
  prod)
    if [[ "$ACTION" == "down" ]]; then
      docker compose -f "$ROOT_DIR/docker-compose.prod.yml" down
      exit 0
    fi

    if [[ ! -f "$ROOT_DIR/.env" ]]; then
      echo "Error: .env no existe. Copia env.example y configura los valores de producción."
      exit 1
    fi

    if [[ ! -f "$ROOT_DIR/infra/certs/origin.crt.pem" || ! -f "$ROOT_DIR/infra/certs/origin.key.pem" ]]; then
      echo "Error: Certificados SSL no encontrados en infra/certs/"
      echo "Se requieren: origin.crt.pem y origin.key.pem"
      exit 1
    fi

    load_env
    compose_up "$ROOT_DIR/docker-compose.prod.yml"
    docker compose -f "$ROOT_DIR/docker-compose.prod.yml" exec backend alembic upgrade head
    ;;
  *)
    echo "Modo inválido: $MODE"
    echo "Uso: scripts/deploy.sh dev|prod [down]"
    exit 1
    ;;
esac
