#!/usr/bin/env bash
set -euo pipefail
API="${API:-http://127.0.0.1:4012/api/v1}"
: "${TOKEN:?Provide TOKEN from /auth/login}"
echo "Health:"
curl -fsS "$API/health"; echo
echo "Current user (must be authorized):"
curl -fsS -H "Authorization: Bearer $TOKEN" "$API/auth/me"; echo
echo "Providers:"
curl -fsS -H "Authorization: Bearer $TOKEN" "$API/providers"; echo
echo "App types:"
curl -fsS -H "Authorization: Bearer $TOKEN" "$API/app-types"; echo
