#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT_DIR/.env"

die() { echo "[-] Error: $*" >&2; exit 1; }

require_env() {
  [[ -f "$ENV_FILE" ]] || die ".env no existe en $ROOT_DIR"
  set -a
  source "$ENV_FILE"
  set +a

  [[ -n "${APP_ENV:-}" ]] || die "APP_ENV no está definido en .env"
  [[ -n "${APP_EXPOSURE:-}" ]] || die "APP_EXPOSURE no está definido en .env"
  [[ -n "${EDGE_NETWORK:-}" ]] || EDGE_NETWORK="edge"

  if [[ "$APP_ENV" == "development" && "$APP_EXPOSURE" == "edge" ]]; then
    die "No se permite APP_EXPOSURE=edge cuando APP_ENV=development"
  fi
}

compose_args() {
  local files=()
  files+=(-f "$ROOT_DIR/docker-compose.base.yml")

  if [[ "$APP_ENV" == "development" ]]; then
    files+=(-f "$ROOT_DIR/docker-compose.dev.yml")
  else
    files+=(-f "$ROOT_DIR/docker-compose.prod.yml")
    if [[ "$APP_EXPOSURE" == "edge" ]]; then
      files+=(-f "$ROOT_DIR/docker-compose.edge.yml")
    else
      files+=(-f "$ROOT_DIR/docker-compose.public.yml")
    fi
  fi

  printf '%s\n' "${files[@]}"
}

dc() {
  local -a files
  mapfile -t files < <(compose_args)
  docker compose "${files[@]}" "$@"
}

ensure_backend_running() {
  local running
  running="$(dc ps --services --filter "status=running" | grep -x "backend" || true)"
  [[ -n "$running" ]] || die "backend no está corriendo."
}

cmd="${1:-}"
shift || true

usage() {
  cat <<'EOF'
Uso:
  ./manage.sh migrate
  ./manage.sh admin-create
  ./manage.sh export-project <PROJECT_ID> --output <file>
  ./manage.sh status
EOF
}

require_env

case "$cmd" in
  migrate)
    ensure_backend_running
    dc exec backend alembic upgrade head
    ;;

  admin-create)
    ensure_backend_running
    dc exec backend flask create-admin
    ;;

  export-project)
    ensure_backend_running
    [[ $# -ge 1 ]] || die "Uso: ./manage.sh export-project <PROJECT_ID> --output <file>"
    PROJECT_ID="$1"
    shift

    OUTPUT=""
    while [[ $# -gt 0 ]]; do
      case "$1" in
        --output)
          shift
          OUTPUT="${1:-}"
          ;;
        *)
          die "Argumento inválido: $1"
          ;;
      esac
      shift || true
    done

    [[ -n "$OUTPUT" ]] || die "Falta --output <file>"
    dc exec backend flask export-project "$PROJECT_ID" --output "$OUTPUT"
    ;;

  status|ps)
    dc ps
    ;;

  ""|-h)
    usage
    ;;

  *)
    die "Comando inválido: '$cmd'"
    ;;
esac

