# Shelf

Клієнт для віддаленої папки з файлами (курс «Інформаційні технології», варіант 8-6).

- `apps/api` — REST-сервер (NestJS, Prisma, PostgreSQL, S3-сховище)
- `packages/shared` — спільна логіка клієнтів: операції варіанта, перегляд, синхронізація, REST-клієнт
- `docs/specs/` — специфікація дизайну (єдине джерело імен)
- `docs/uml/` — UML-діаграми: `drawio/` редаговані, `img/` експорт у PNG/SVG
- `docs/reports/` — звіти етапів (Markdown, DOCX, PDF)

## Локальний запуск сервера

Потрібні Node.js 22+, pnpm 10 (`corepack enable pnpm`) і Docker.

```bash
pnpm install
cp docker/.env.example docker/.env
pnpm stack:up      # PostgreSQL :5433, MinIO :9100 (консоль :9101), API :4000
pnpm seed          # artem@shelf.dev, iryna@shelf.dev, maksym@shelf.dev; пароль shelf-demo-2026
pnpm smoke         # перевірка REST API
```

Swagger: http://localhost:4000/api/docs. Тести: `pnpm test`. Зупинити: `pnpm stack:down`, скинути дані: `pnpm stack:reset`.

Збірка звіту: `tools/build-report.sh docs/reports/<звіт>.md` (потрібні pandoc і xelatex).
