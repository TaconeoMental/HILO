#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT_DIR/.env"

#echo $ROOT_DIR

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
    die "No se permite APP_EXPOSURE=edge con APP_ENV=development"
  fi

  if [[ "$APP_ENV" != "development" && "$APP_ENV" != "production" ]]; then
    die "APP_ENV inválido: Valores válidos de '$APP_ENV'"
  fi

  if [[ "$APP_EXPOSURE" != "public" && "$APP_EXPOSURE" != "edge" ]]; then
    die "APP_EXPOSURE inválido: Valores válidos de '$APP_EXPOSURE'"
  fi
}

load_env() {
  set -a
  source "$ENV_FILE"
  set +a
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

  load_env
  docker compose "${files[@]}" "$@"
}

ensure_edge_network() {
  # Solo para production+edge
  if [[ "$APP_ENV" == "production" && "$APP_EXPOSURE" == "edge" ]]; then
    if docker network inspect "$EDGE_NETWORK" >/dev/null 2>&1; then
      echo "Docker network '$EDGE_NETWORK' ya existe"
    else
      echo "Creando docker network '$EDGE_NETWORK'..."
      docker network create "$EDGE_NETWORK" >/dev/null
    fi
  fi
}

cmd="${1:-}"
shift || true

usage() {
  cat <<'EOF'
Uso:
  ./stack.sh up [args...]
  ./stack.sh down [args...]
  ./stack.sh status
  ./stack.sh restart <servicios>
  ./stack.sh rebuild <servicios>
  ./stack.sh logs [args...] [-- <servicios>]
  ./stack.sh prune                     
  ./stack.sh config [args...]
EOF
}

require_env

case "$cmd" in
  up)
    ensure_edge_network
    dc up -d --build "$@"
    ;;

  down)
    dc down "$@"
    ;;

  status|ps)
    dc ps
    ;;

  restart)
    [[ $# -ge 1 ]] || die "Uso: ./deploy.sh restart <services>"
    dc restart "$@"
    ;;

  rebuild)
    [[ $# -ge 1 ]] || die "Uso: ./deploy.sh rebuild <services>"
    ensure_edge_network

    dc stop "$@" || true
    dc rm -f "$@" ||  true
    dc build "$@" || true
    dc up -d --no-deps --force-recreate "$@"
    ;;

  logs)
    args=()
    svcs=()
    seen_sep=0
    for a in "$@"; do
      if [[ "$a" == "--" ]]; then
        seen_sep=1
        continue
      fi
      if [[ $seen_sep -eq 0 ]]; then
        args+=("$a")
      else
        svcs+=("$a")
      fi
    done

    if [[ ${#svcs[@]} -gt 0 ]]; then
      dc logs "${args[@]}" "${svcs[@]}"
    else
      dc logs "${args[@]}"
    fi
    ;;

  prune)
    dc down -v --remove-orphans

    if docker network inspect "$EDGE_NETWORK" >/dev/null 2>&1; then
      echo "Eliminando docker network '$EDGE_NETWORK'..."
      docker network rm "$EDGE_NETWORK" >/dev/null
    fi
    ;;

  ""|-h)
    usage
    ;;

  config)
    dc config "$@"
    ;;

  *)
    die "Comando inválido: '$cmd'"
    ;;
esac

