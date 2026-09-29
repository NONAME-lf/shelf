# Shelf

Клієнт для віддаленої папки з файлами (курс «Інформаційні технології», варіант 8-6).

- `apps/api` — REST-сервер (NestJS, Prisma, PostgreSQL, S3-сховище)
- `apps/desktop` — десктоп-клієнт (Electron, React, Vite)
- `packages/shared` — спільна логіка клієнтів: операції варіанта, перегляд, синхронізація, REST-клієнт
- `packages/ui` — спільні React-компоненти клієнтів
- `docs/specs/` — специфікація дизайну (єдине джерело імен)
- `docs/uml/` — UML-діаграми: `drawio/` редаговані, `img/` експорт у PNG/SVG
- `docs/reports/` — звіти етапів (Markdown, DOCX, PDF)

## Локальний запуск сервера

Потрібні Node.js 22.12+, pnpm 10 (`corepack enable pnpm`) і Docker.

```bash
pnpm install
pnpm build         # збирає пакети; без зібраного @shelf/shared не запускаються ні клієнт, ні тести
cp docker/.env.example docker/.env
pnpm stack:up      # PostgreSQL :5433, MinIO :9100 (консоль :9101), API :4000
pnpm seed          # artem@shelf.dev, iryna@shelf.dev, maksym@shelf.dev; пароль shelf-demo-2026
pnpm smoke         # перевірка REST API
```

Swagger: http://localhost:4000/api/docs. Тести: `pnpm test`. Зупинити: `pnpm stack:down`, скинути дані: `pnpm stack:reset`.

## Десктоп-клієнт

Спершу `pnpm install` і `pnpm build` (див. вище).

```bash
pnpm -F @shelf/desktop dev        # запуск у режимі розробки
pnpm -F @shelf/desktop dist:mac   # збірка .dmg у apps/desktop/release
pnpm -F @shelf/desktop smoke      # наскрізна перевірка UI (потрібен pnpm stack:up і pnpm seed)
```

На екрані входу можна змінити адресу сервера. Звіт етапу 2: `docs/reports/stage2-desktop.pdf`.

Збірка звіту: `tools/build-report.sh docs/reports/<звіт>.md` (потрібні pandoc і xelatex).
