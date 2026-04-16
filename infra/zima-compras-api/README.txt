Arquivos minimos para subir a API de compras no ZimaOS.

Variaveis esperadas:
- PORT=3210
- API_TOKEN=trocar-por-token-forte
- DATABASE_URL=postgresql://scan_app:SENHA@compras-db:5432/scan_compras
- DATABASE_SSL=false

Endpoints:
- GET /health
- GET /compras/tasks
- POST /compras/tasks/upsert
- POST /compras/eventos
- PATCH /compras/tasks/:id/status
