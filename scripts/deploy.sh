#!/usr/bin/env bash
set -euo pipefail

MODE=${1:-}
ACTION=${2:-up}

if [[ -z "$MODE" ]]; then
  echo "Uso: scripts/deploy.sh dev|prod [down]"
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

case "$MODE" in
  dev)
    if [[ "$ACTION" == "down" ]]; then
      docker compose -f "$ROOT_DIR/docker-compose.yml" down
      exit 0
    fi

    if [[ ! -f "$ROOT_DIR/.env" && -f "$ROOT_DIR/env.example" ]]; then
      cp "$ROOT_DIR/env.example" "$ROOT_DIR/.env"
    fi

    docker compose -f "$ROOT_DIR/docker-compose.yml" up -d --build

    "$ROOT_DIR/scripts/manage.sh" dev migrate
    ;;
  prod)
    if [[ "$ACTION" == "down" ]]; then
      docker compose -f "$ROOT_DIR/docker-compose.prod.yml" stop frontend
      exit 0
    fi

    docker compose -f "$ROOT_DIR/docker-compose.prod.yml" up -d --build
    docker compose -f "$ROOT_DIR/docker-compose.prod.yml" exec backend alembic upgrade head
    ;;
  *)
    echo "Modo inválido: $MODE"
    echo "Uso: scripts/deploy.sh dev|prod [down]"
    exit 1
    ;;
esac
