#!/usr/bin/env bash
# FAZ 64: Eşzamanlı çift QR okutma ve son stok yarışı — iki ayrı veritabanı bağlantısıyla.
set -euo pipefail
DB="$1"
DIR="$(cd "$(dirname "$0")" && pwd)"
PSQL=(psql -X -q -v ON_ERROR_STOP=1 -d "$DB" -At)
"${PSQL[@]}" -f "$DIR/setup.sql" >/dev/null
ctx() { "${PSQL[@]}" -c "select value from tests.conc_ctx where key = '$1'"; }
ORDER=$(ctx order); TOKEN=$(ctx token); KU=$(ctx courier_user); HASH=$(ctx hash)
C1=$(ctx c1); C2=$(ctx c2); Q1=$(ctx q1); Q2=$(ctx q2); LAST=$(ctx last)
TMP=$(mktemp -d)

# İlk bağlantı token'ı tüketip işlemi 1.5 sn açık tutar; ikinci bağlantı bu sırada aynı token'ı dener.
cat > "$TMP/a.sql" <<SQL
begin;
select set_config('role', 'service_role', true) \g /dev/null
select public.consume_delivery_qr('$TOKEN', '$ORDER', '$HASH', '$KU', 41.4, 41.4, '{}'::jsonb);
select pg_sleep(1.5) \g /dev/null
commit;
SQL
cat > "$TMP/b.sql" <<SQL
begin;
select set_config('role', 'service_role', true) \g /dev/null
select public.consume_delivery_qr('$TOKEN', '$ORDER', '$HASH', '$KU', 41.4, 41.4, '{}'::jsonb);
commit;
SQL
"${PSQL[@]}" -f "$TMP/a.sql" > "$TMP/a.out" 2>&1 &
PA=$!
sleep 0.4
"${PSQL[@]}" -f "$TMP/b.sql" > "$TMP/b.out" 2>&1 &
PB=$!
wait $PA $PB || true
A=$(cat "$TMP/a.out"); B=$(cat "$TMP/b.out")
ok=0
if echo "$A" | grep -q '"delivered"' && echo "$B" | grep -q 'KPD_QR_ALREADY_USED'; then
  echo "    ok   - eşzamanlı çift okutmada yalnız biri başarılı (A: delivered, B: KPD_QR_ALREADY_USED)"
else
  echo "    FAIL - eşzamanlı QR: A=[$A] B=[$B]"; ok=1
fi
DELIVERED=$("${PSQL[@]}" -c "select count(*) from public.order_status_history where order_id = '$ORDER' and new_status = 'delivered'")
COMM=$("${PSQL[@]}" -c "select count(*) from public.platform_commissions where order_id = '$ORDER'")
if [ "$DELIVERED" = "1" ] && [ "$COMM" = "1" ]; then
  echo "    ok   - tek delivered geçmiş kaydı ve tek komisyon"
else
  echo "    FAIL - delivered=$DELIVERED komisyon=$COMM"; ok=1
fi

# Son stok yarışı: iki müşteri aynı anda son ürünü sipariş eder
order_sql() {
  cat <<SQL
begin;
select set_config('role', 'authenticated', true) \g /dev/null
select set_config('request.jwt.claims', json_build_object('sub', '$1', 'role', 'authenticated')::text, true) \g /dev/null
select public.create_order('$2', '[{"product_id":"$LAST","quantity":1}]'::jsonb, 'cash') ->> 'status';
select pg_sleep(0.5) \g /dev/null
commit;
SQL
}
order_sql "$C1" "$Q1" > "$TMP/o1.sql"; order_sql "$C2" "$Q2" > "$TMP/o2.sql"
"${PSQL[@]}" -f "$TMP/o1.sql" > "$TMP/o1.out" 2>&1 &
P1=$!
"${PSQL[@]}" -f "$TMP/o2.sql" > "$TMP/o2.out" 2>&1 &
P2=$!
wait $P1 $P2 || true
O=$(cat "$TMP/o1.out" "$TMP/o2.out")
SUCC=$(echo "$O" | grep -c '^pending_payment$' || true)
OOS=$(echo "$O" | grep -c 'KPD_OUT_OF_STOCK' || true)
STOCK=$("${PSQL[@]}" -c "select stock_quantity from public.products where id = '$LAST'")
if [ "$SUCC" = "1" ] && [ "$OOS" = "1" ] && [ "$STOCK" = "0" ]; then
  echo "    ok   - son stok yarışında yalnız bir sipariş oluştu, stok negatife düşmedi"
else
  echo "    FAIL - stok yarışı: başarı=$SUCC stok_hatası=$OOS stok=$STOCK çıktı=[$O]"; ok=1
fi
rm -rf "$TMP"
if [ $ok -eq 0 ]; then echo "PASS concurrency/run.sh (3 doğrulama)"; else echo "FAIL concurrency/run.sh"; fi
exit $ok
