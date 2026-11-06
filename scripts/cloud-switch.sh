#!/usr/bin/env bash
# Run inside the dedicated cloud sandbox after transferring the deployment bundle.
# Do not use docker exec: the cloud platform documents incorrect filesystem resolution.
set -euo pipefail
cd "$(dirname "$0")/.."
action="${1:-status}"
case "$action" in pull|up|check|status|stop) ;; *) echo 'Use cloud-switch.sh pull|up|check|status|stop' >&2; exit 1 ;; esac
test -f .env || { echo 'Private deployment .env is missing.' >&2; exit 1; }
chmod 600 .env
docker version --format '{{.Server.Version}}' >/dev/null
docker compose version >/dev/null
compose=(docker compose --env-file .env -f deploy/switch/compose.yaml -f deploy/switch/override.yaml -f deploy/switch/cloud-override.yaml --project-name two-hands-switch --profile collab --profile gateway)
case "$action" in
  pull) "${compose[@]}" pull ;;
  up) "${compose[@]}" up -d --pull never ;;
  status) "${compose[@]}" ps --all ;;
  stop) "${compose[@]}" stop ;;
  check)
    # Check real service endpoints from the VM; never equate container state with readiness.
    for url in http://127.0.0.1:18000/health http://127.0.0.1:18065/api/v4/system/ping http://127.0.0.1:13000/; do
      ready=false
      for ((attempt=0; attempt<30; attempt++)); do
        if curl --fail --silent --max-time 4 "$url" >/dev/null; then ready=true; break; fi
        sleep 2
      done
      if [[ "$ready" != true ]]; then echo "Readiness failed: $url. Inspect sanitized service logs; do not print .env." >&2; exit 1; fi
      echo "HTTP readiness passed: $url"
    done
    setup_id="$("${compose[@]}" ps -aq setup)"
    test -n "$setup_id" || { echo 'Setup container is absent.' >&2; exit 1; }
    setup_state="$(docker inspect --format '{{.State.Status}}:{{.State.ExitCode}}' "$setup_id")"
    test "$setup_state" = 'exited:0' || { echo "Account setup pending/failed: $setup_state" >&2; exit 1; }
    echo 'Service readiness and setup exit passed. Agent transport and human identity still require verification.'
    ;;
esac
