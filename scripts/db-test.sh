#!/usr/bin/env bash
# Supabase migration'larını izole bir PostgreSQL veritabanında uygular ve SQL invariant testlerini çalıştırır.
# Production veritabanına ASLA bağlanmaz: hedef yerel/CI PostgreSQL'dir ve her çalıştırmada geçici DB oluşturulur.
# Ortam: PGHOST, PGPORT, PGUSER (varsayılan: localhost, 5432, postgres)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DB="kapinda_test_$$"
export PGHOST="${PGHOST:-localhost}" PGPORT="${PGPORT:-5432}" PGUSER="${PGUSER:-postgres}"

cleanup() { dropdb --if-exists "$DB" >/dev/null 2>&1 || true; }
trap cleanup EXIT

createdb "$DB"
export KAPINDA_ROOT="$ROOT"
PSQL=(psql -X -q -v ON_ERROR_STOP=1 -d "$DB")
"${PSQL[@]}" -f "$ROOT/supabase/tests/shim/supabase_shim.sql"
for f in "$ROOT"/supabase/migrations/*.sql; do
  echo "migration: $(basename "$f")"
  "${PSQL[@]}" -f "$f"
done

pass=0; fail=0; asserts=0
for t in "$ROOT"/supabase/tests/*.sql; do
  if out=$("${PSQL[@]}" -v test_db="$DB" -f "$t" 2>&1); then
    n=$(echo "$out" | grep -c 'ok   - ' || true)
    echo "PASS $(basename "$t") ($n doğrulama)"
    [ -n "${VERBOSE:-}" ] && echo "$out" | grep -o 'ok   - .*' | sed 's/^/    /'
    asserts=$((asserts+n))
    pass=$((pass+1))
  else
    echo "FAIL $(basename "$t")"
    echo "$out" | sed 's/^/    /'
    fail=$((fail+1))
  fi
done

# Eşzamanlılık testleri (iki ayrı bağlantı)
if [ -x "$ROOT/supabase/tests/concurrency/run.sh" ]; then
  if "$ROOT/supabase/tests/concurrency/run.sh" "$DB"; then pass=$((pass+1)); else fail=$((fail+1)); fi
fi

echo "SQL test dosyaları: $pass geçti, $fail başarısız; toplam $asserts doğrulama"
[ "$fail" -eq 0 ]
