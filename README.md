# Shelf

Клієнт для віддаленої папки з файлами (курс «Інформаційні технології», варіант 8-6).

- `apps/api` — REST-сервер (NestJS, Prisma, PostgreSQL, S3-сховище)
- `apps/desktop` — десктоп-клієнт (Electron, React, Vite)
- `apps/web` — веб-клієнт (Next.js, React)
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

## Веб-клієнт

Спершу `pnpm install` і `pnpm build` (див. вище); сервер має працювати (`pnpm stack:up`) і бути заповненим (`pnpm seed`).

```bash
pnpm stack:up                                        # якщо ще не запущено
pnpm seed                                            # демонстраційні користувачі (один раз)
pnpm dev:web                                         # http://localhost:3000 у режимі розробки
pnpm -F @shelf/web build && pnpm -F @shelf/web start # продакшн-збірка і запуск на :3000
pnpm -F @shelf/web test                              # unit-тести (Vitest, без браузера)
pnpm -F @shelf/web exec playwright install chromium  # один раз перед наскрізною перевіркою
pnpm -F @shelf/web smoke                             # наскрізна перевірка UI (потрібен pnpm stack:up)
```

Адреса API задається під час збірки змінною `NEXT_PUBLIC_API_URL` (за замовчуванням `http://localhost:4000`),
тому на екрані входу поля адреси немає. Синхронізація з локальною папкою працює в Chrome і Edge (File System
Access API); у Firefox і Safari доступні решта функцій. Автоматичне відстеження у вебі — опитування папки кожні
5 с, поки вкладка видима. Якщо порт 3000 зайнятий: `SHELF_WEB_PORT=3100 pnpm -F @shelf/web smoke`.

Розгортання на Vercel: корінь проєкту `apps/web`, команди встановлення і збірки — у `apps/web/vercel.json`.

Збірка звіту: `tools/build-report.sh docs/reports/<звіт>.md` (потрібні pandoc і xelatex).
