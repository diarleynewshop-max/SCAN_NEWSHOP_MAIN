#!/bin/sh
set -eu

cd /opt/evolution-api
WORKER_PASS=$(openssl rand -hex 40)
if grep -q '^SUPABASE_DB_PASSWORD=' .env; then
  sed -i "s/^SUPABASE_DB_PASSWORD=.*/SUPABASE_DB_PASSWORD=$WORKER_PASS/" .env
else
  printf 'SUPABASE_DB_PASSWORD=%s\n' "$WORKER_PASS" >> .env
fi

printf "alter role relatorio_worker login password '%s';\n" "$WORKER_PASS" \
  | docker exec -i supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1

if grep -q '^SUPABASE_DB_USER=' .env; then
  sed -i 's/^SUPABASE_DB_USER=.*/SUPABASE_DB_USER=relatorio_worker/' .env
else
  printf 'SUPABASE_DB_USER=relatorio_worker\n' >> .env
fi
chmod 600 .env
echo "Worker configurado."
