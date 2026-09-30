# Shelf — специфікація дизайну

Курс «Інформаційні технології», 4 курс, модуль 1. Система **типу 2**: клієнт для взаємодії
з віддаленою папкою з файлами (полегшена версія Google Drive). Робоча назва — **Shelf**.

Цей документ — єдине джерело імен для UML-діаграм, коду і звітів. Діаграми, код і звіти
вживають імена з нього дослівно.

Автор: Мекшаков Артемій Олексійович, група МІ-41, ФКНК КНУ імені Тараса Шевченка.
Дедлайн усіх етапів — 8.10.2026.

## 1. Варіант і обсяг

Варіант **8-6** (дві останні цифри студентського квитка):

| Цифра | Список | Значення |
|---|---|---|
| 8 | ТИПИ файлів, вміст яких показується при кліку | `.kt` — як текст, `.jpg` — як зображення |
| 6 | ОПЕРАЦІЇ | сортування за назвою (зростання / спадання); фільтр «усі файли» / «лише `.cpp`» / «лише `.png`» |

Етапи: 1 — UML-специфікація (2 б.); 2 — десктоп-версія + unit-тести (3+, один на операцію
варіанта) + GUI + звіт (13 б.); 3 — веб-версія + GUI + звіт (13 б.); 4 — порівняльний аналіз
(2 б.). Бонуси: drag-and-drop при за/вивантаженні (+5), публікація серверної частини з
публічною адресою (+5). Обидва бонуси виконано (drag-and-drop — §7.3–7.5, публікація — §9).

**Нюанс варіанта.** Типи перегляду (`.kt`, `.jpg`) і типи фільтра (`.cpp`, `.png`) не
збігаються, бо цифри незалежні. Перегляд реалізується узагальнено: будь-який текстовий файл
(`.kt`, `.cpp`, `.txt`, `.md`, `.json`, …) показується як текст, будь-яке растрове зображення
(`.jpg`, `.jpeg`, `.png`, `.gif`, `.webp`) — як картинка. Обов'язковими й покритими тестами
випадками є `.kt` та `.jpg`; для решти типів показуються лише атрибути з поміткою «перегляд
недоступний».

### 1.1. Функціональні вимоги

| ID | Вимога | Прецеденти |
|---|---|---|
| R1 | Реєстрація та вхід на віддаленому сервері; після входу користувач у власному просторі (віртуальному диску) | UC1, UC2, UC3, UC15 |
| R2 | Перегляд файлів з атрибутами: назва, дата і час створення, дата і час зміни, хто завантажив, хто редагував (допоміжно — розмір, тип) | UC4 |
| R3 | Показ / приховування будь-якого стовпця, крім назви | UC7 |
| R4 | Сортування за назвою за зростанням і спаданням (операція варіанта) | UC5 |
| R5 | Фільтр: усі файли / лише `.cpp` / лише `.png` (операція варіанта) | UC6 |
| R6 | Клік по файлу показує вміст: `.kt` як текст, `.jpg` як зображення (тип варіанта) | UC8 |
| R7 | Завантаження файлу (нового або нової версії наявного), скачування, видалення | UC9, UC10, UC11, UC12 |
| R8 | Синхронізація обраної локальної папки з віддаленим простором; конфлікти версій виявляються і розв'язуються | UC13, UC14 |
| R9 | Бонус: drag-and-drop при завантаженні (обидва клієнти) і при скачуванні (перетягування з вікна десктоп-клієнта) | UC9b, UC11a |

### 1.2. Нефункціональні вимоги

- **Безпека**: паролі — bcrypt-хеші; сесія — JWT (HS256, 24 год) у заголовку
  `Authorization: Bearer`; користувач бачить лише файли свого простору.
- **Обмеження**: розмір файлу до 50 МБ (перевірка на клієнті й на сервері); простір плоский,
  без підпапок; ім'я файлу унікальне в межах простору.
- **Переносимість**: десктоп — macOS і Windows (Electron); веб — сучасні браузери; синхронізація
  у вебі — Chrome / Edge (File System Access API).
- **Тестованість**: сортування, фільтр, вибір способу перегляду й обчислення статусу
  синхронізації — чисті функції у спільному пакеті, покриті unit-тестами без сервера.
- **Розгортання**: сервер працює локально в Docker Compose і публікується на керованих
  сервісах без власної VM.

### 1.3. Поза обсягом

Спільний доступ між користувачами, підпапки, редагування тексту в застосунку, історія версій,
квоти, поширення видалень при синхронізації.

## 2. Дійові особи та прецеденти

Єдина дійова особа — **User** (користувач з обліковим записом). Неавторизований відвідувач
може лише зареєструватися або увійти. Сховище об'єктів і база даних — внутрішні компоненти,
не актори.

| ID | Прецедент (підпис на діаграмі) | Зв'язок | Група кольору |
|---|---|---|---|
| UC1 | Sign up | User → UC1 | access |
| UC2 | Log in to the system | User → UC2; примітка: подальша взаємодія вимагає авторизованого користувача | access |
| UC3 | Work with the file storage | User → UC3; `include` UC2, `include` UC4 | access |
| UC4 | View the list of files and their attributes | `include` з UC3 | list |
| UC5 | Sort by name | `extend` UC4; листки «Ascending», «Descending» | list |
| UC6 | Filter by type | `extend` UC4; листки «All files», «Only .cpp», «Only .png» | list |
| UC7 | Show / hide table columns | `extend` UC4; листки «Creation date», «Modification date», «Uploaded by», «Edited by», «Size» | list |
| UC8 | View the file contents | `extend` UC4; листки «.kt as text», «.jpg as image» | list |
| UC9 | Upload file(s) to the storage | `extend` UC3; UC9a «Select and upload», UC9b «Drag-and-drop» | files |
| UC10 | Update a file (new version) | `extend` UC3; примітка: оновлює «modification date» і «edited by» | files |
| UC11 | Download file(s) | `extend` UC3; UC11a «Drag out of the window» (desktop only) | files |
| UC12 | Delete file(s) | `extend` UC3 | files |
| UC13 | Bind / change local folder | `extend` UC3 | sync |
| UC14 | Synchronize with the local folder | `extend` UC3; передумова — прив'язана папка; UC14a «Automatic tracking of folder changes» (desktop — folder watcher, web — polling), UC14b «Resolve version conflicts» (за замовчуванням перемагає новіша) | sync |
| UC15 | Log out from the system | User → UC15 | access |

Прецедент варіанта для VOPC і діаграми комунікації — **UC5 + UC6** («Sort and filter the
file list»). Прецедент типу варіанта для діаграми послідовності — **UC8**.

Кольори гілок наскрізні для всіх діаграм: **access** (блакитний) — вхід і сесія; **list**
(рожевий) — список, сортування, фільтр, перегляд; **files** (помаранчевий) — за/вивантаження,
оновлення, видалення; **sync** (фіолетовий) — синхронізація; **infra** (сірий) — інфраструктура.
На діаграмах класів колір натомість кодує стереотип: «boundary», «control», «entity»,
«utility», «enumeration».

## 3. Доменна модель

Використовується на діаграмі класів 02 і є основою для типів у `@shelf/shared` та Prisma-схеми.

| Клас | Атрибути | Операції | Примітки |
|---|---|---|---|
| `User` | `id`, `email`, `displayName`, `passwordHash`, `createdAt` | `register(email, password, displayName): User`, `authenticate(email, password): Session` | один `Workspace` на користувача |
| `Session` | `id`, `user: User`, `token`, `expiresAt` | `isValid(): bool`, `revoke(): void` | JWT на клієнті |
| `Workspace` «virtual drive» | `id`, `owner: User`, `files: List<FileEntry>` | `getFiles(): List<FileEntry>`, `addFile(f: FileEntry): void`, `removeFile(id): bool` | композиція `FileEntry` |
| `FileEntry` | `id`, `name`, `extension`, `size`, `checksum`, `createdAt`, `modifiedAt`, `uploadedBy: User`, `editedBy: User` | `getName()`, `getExtension()`, `isNewerThan(other: FileEntry): bool` | рядок метаданих |
| `FileContent` | `storageKey`, `mimeType`, `bytes` | `getStream(): Stream` | об'єкт у S3-сховищі; `FileEntry` 1 — 1 `FileContent` |
| `FilePreview` «abstract» | `# entry: FileEntry` | `canRender(ext): bool`, `render(content: FileContent): PreviewResult` | |
| `TextPreview` «.kt» | `encoding` | перевизначає | будь-який текстовий тип |
| `ImagePreview` «.jpg» | `width`, `height` | перевизначає | будь-який растровий тип |
| `LocalFolder` | `path`, `boundAt` | `listFiles(): List<LocalFile>`, `isBound(): bool`, `read(name): bytes`, `write(name, bytes, modifiedAt): void` | у десктопі — Node `fs`; у вебі — File System Access API. Примітка: у коді `write` повертає `LocalFile` записаного файлу з його справжнім часом зміни (веб потребує цього, §5.4); назви на діаграмі збережено |
| `LocalFile` | `name`, `path`, `size`, `modifiedAt` | `checksum(): string` | |
| `SyncSnapshot` | `folderPath`, `syncedAt`, `entries: Map<name, SnapshotEntry>` | `get(name)`, `put(entry)`, `remove(name)` | стан після останньої успішної синхронізації |
| `SnapshotEntry` | `name`, `localModifiedAt`, `localSize`, `remoteModifiedAt`, `checksum`, `remoteId?` | — | `remoteId` — `id` серверного файлу, з яким виконано синхронізацію (див. §5.2) |
| `SyncItem` | `name`, `local: LocalFile?`, `remote: FileEntryDto?`, `status: SyncStatus`, `resolution: Side?` | `decideDirection(item): Side?` — функція планувальника, а не метод | один запис плану на ім'я файлу |
| `SyncEngine` | `localFolder: LocalFolder`, `workspace: Workspace`, `snapshot: SyncSnapshot`, `items: List<SyncItem>` | `scan(): List<SyncItem>`, `conflicts(): List<SyncItem>`, `resolve(name, keep: Side): void`, `synchronize(onProgress?): SyncReport` | спостереження за папкою — у десктопних `SyncService` / `FolderWatcher` |
| `SyncReport` | `uploaded`, `downloaded`, `skipped`, `conflicts`, `errors: List<string>` | — | |

Переліки:

```
SortDirection { ASCENDING, DESCENDING }
TypeFilter    { ALL_FILES, ONLY_CPP, ONLY_PNG }
PreviewKind   { TEXT, IMAGE, NONE }
SyncStatus    { IN_SYNC, LOCAL_ONLY, REMOTE_ONLY, LOCAL_NEWER, REMOTE_NEWER, CONFLICT }
Side          { LOCAL, REMOTE }
```

Ключовий інваріант операції варіанта:

```
getVisibleFiles() = filterByType(sortByName(files, direction), filter)
```

Фільтр застосовується поверх відсортованого списку, тому обраний порядок не губиться при
перемиканні фільтра. `FileListOperations` — чисті функції без стану в `@shelf/shared`; саме
на них пишеться обов'язковий unit-тест етапу 2.

## 4. Класи VOPC (прецедент UC5 + UC6)

| Стереотип | Клас | Атрибути / операції |
|---|---|---|
| «boundary» | `SortHeaderControl` | `direction: SortDirection`; `onHeaderClick(): void`, `toggleDirection(): void` |
| «boundary» | `TypeFilterControl` | `filter: TypeFilter`; `onFilterSelect(f: TypeFilter): void` |
| «boundary» | `FileTableView` | `rows: List<FileEntry>`; `render(files: List<FileEntry>): void` |
| «control» | `FileListController` | `files: List<FileEntry>`, `direction = ASCENDING`, `filter = ALL_FILES`; `loadFiles(): void`, `setDirection(d): void`, `setFilter(f): void`, `getVisibleFiles(): List<FileEntry>` |
| «control» | `FileApiClient` | `baseUrl`, `token`; `listFiles(): List<FileEntry>` (+ решта методів, див. §6) |
| «utility» | `FileListOperations` | `sortByName(files, d: SortDirection): List<FileEntry>`, `filterByType(files, t: TypeFilter): List<FileEntry>` |
| «entity» | `FileEntry`, `Workspace` | з доменної моделі |
| «enumeration» | `SortDirection`, `TypeFilter` | |

Послідовність повідомлень для діаграми комунікації 07:

```
1  User → FileTableView:        openFileList()
1.1 FileTableView → FileListController: loadFiles()
1.2 FileListController → FileApiClient: listFiles(): List<FileEntry>
1.3 FileListController → FileListOperations: sortByName(files, direction)
1.4 FileListController → FileListOperations: filterByType(sorted, filter)
1.5 FileListController → FileTableView: render(visibleFiles)
2  User → SortHeaderControl:    onHeaderClick()
2.1 SortHeaderControl → SortHeaderControl: toggleDirection()
2.2 SortHeaderControl → FileListController: setDirection(d)
2.3–2.5 як 1.3–1.5
3  User → TypeFilterControl:    onFilterSelect(f)
3.1 TypeFilterControl → FileListController: setFilter(f)
3.2–3.4 як 1.3–1.5
```

## 5. Синхронізація

### 5.1. Прив'язка папки

Папка прив'язується один раз і запам'ятовується окремо для кожного облікового запису (десктоп —
JSON у `userData`; веб — handle у IndexedDB). Кнопка «Synchronize» працює з прив'язаною папкою;
якщо папки немає — відкриває діалог вибору. Поруч видно шлях (у вебі — лише назву папки) і кнопку
«Change». Автоматичне відстеження змін — окремий перемикач, доступний після прив'язки: у десктопі —
`chokidar`, у вебі — опитування списку файлів папки кожні 5 с (§7.5). Отже, відстеження (UC14a)
реалізовано спостерігачем за папкою в десктопі й опитуванням у вебі.

### 5.2. Обчислення статусу

`SyncEngine.scan()` будує `SyncItem` для кожного імені з об'єднання локального списку,
віддаленого списку і знімка. Порівняння за іменем; підпапки й приховані файли (`.`-префікс)
ігноруються, як і імена, що відрізняються лише регістром або формою Unicode (див. §5.4).

| Локально | Віддалено | Знімок | Умова | Статус |
|---|---|---|---|---|
| є | немає | — | | `LOCAL_ONLY` |
| немає | є | — | | `REMOTE_ONLY` |
| є | є | є | нічого не змінилося відносно знімка | `IN_SYNC` |
| є | є | є | змінилося лише локально | `LOCAL_NEWER` |
| є | є | є | змінилося лише віддалено | `REMOTE_NEWER` |
| є | є | є | змінилося з обох боків | `CONFLICT` |
| є | є | немає | `checksum` збігаються | `IN_SYNC` |
| є | є | немає | вміст різний | `CONFLICT` |

«Змінилося локально» = `localFile.modifiedAt ≠ snapshot.localModifiedAt` або
`localFile.size ≠ snapshot.localSize`. «Змінилося віддалено» = `remoteFile.modifiedAt ≠
snapshot.remoteModifiedAt` або `remoteFile.checksum ≠ snapshot.checksum` (знімок пам'ятає контрольну
суму віддаленої версії на момент синхронізації, тож нова версія, вивантажена в межах допуску часу,
теж помічається). Допуск для часу — 2 с включно; нечитабельний час вважається зміною.
Запис знімка іншого серверного файлу (`snapshot.remoteId ≠ remoteFile.id` — інший акаунт або
скинутий сервер) не враховується: файл порівнюється так, ніби знімка немає (рядки з `checksum`).

Видалення не поширюються: файл, відсутній з одного боку, копіюється з іншого. Це задокументоване
обмеження (див. §1.3).

### 5.3. Розв'язання конфліктів

`decideDirection(item)` для `CONFLICT` без вибору користувача повертає бік з новішим
`modifiedAt` (за рівного часу — `REMOTE`) — це вибір за замовчуванням. Після `scan()` клієнт
показує `ConflictDialog` зі списком усіх конфліктних елементів (`conflicts()`); для кожного
користувач обирає `LOCAL` або `REMOTE` (попередньо позначено новіший). `resolve(name, keep)`
записує вибір, `synchronize()` виконує план. Коли синхронізацію запускає автоматичне
відстеження (спостерігач папки в десктопі, опитування у вебі), діалог не показується — застосовується
вибір за замовчуванням.

### 5.4. Виконання плану

Для кожного `SyncItem`: `LOCAL_ONLY`, `LOCAL_NEWER`, `CONFLICT/LOCAL` → upload;
`REMOTE_ONLY`, `REMOTE_NEWER`, `CONFLICT/REMOTE` → download; `IN_SYNC` → skip. Після успішного
переносу оновлюється `SnapshotEntry` (разом з `remoteId`); після download локальному файлу
виставляється `modifiedAt` віддаленої версії (десктоп). Браузер не може задати час зміни: скачаний
файл отримує поточний час, і знімок записує саме його — `LocalFolder.write` повертає файл таким, яким
він є після запису, тож наступна синхронізація не вважає його зміненим локально.
Невдалий перенос залишає файл у попередньому стані й додає запис до `SyncReport.errors`.
Наприкінці знімок зберігається, а `SyncReport` показується користувачу.

План, побудований раніше окремим викликом `scan()` (наприклад, поки відкрито `ConflictDialog`),
перед переносом перевіряється знову: обидва боки перелічуються ще раз, і файл, у якого з того
часу змінився локальний бік (наявність, розмір, `modifiedAt`) або віддалений (наявність, `id`,
`modifiedAt`), пропускається з помилкою «файл змінився після перевірки — запустіть
синхронізацію ще раз»; його `SnapshotEntry` не змінюється. Так правка, зроблена під час вибору,
не перезаписується.

Імена, що відрізняються лише регістром або формою Unicode (`Main.kt` і `main.kt`; NFC і NFD), на
файлових системах без розрізнення регістру (macOS, Windows) позначають один файл. Такі імена
(з обох боків разом) до плану не потрапляють: кожне додається до `SyncReport.errors` як
пропущене, а його `SnapshotEntry` зберігається.

### 5.5. Стани файлу (діаграма 08)

`LocalOnly`, `RemoteOnly` → (upload / download) → композитний стан `Tracked` зі станами
`Synced`, `ModifiedLocally`, `ModifiedRemotely`, `Conflict`; `resolve(keep) / transfer` повертає
у `Synced`; видалення з будь-якого боку виводить файл із `Tracked`. Один початковий псевдостан
із розгалуженням «[exists locally only] / [exists remotely only]».

## 6. Сервер — `apps/api` (NestJS)

| Модуль | Класи | Відповідальність |
|---|---|---|
| `AuthModule` | `AuthController`, `AuthService`, `JwtStrategy`, `JwtAuthGuard` | реєстрація, вхід, видача й перевірка JWT |
| `UsersModule` | `UsersService` | пошук і створення користувачів, bcrypt |
| `WorkspaceModule` | `WorkspaceController`, `WorkspaceService` | простір користувача, список файлів, метадані |
| `FilesModule` | `FilesController`, `FilesService` | upload / download / delete, оновлення версії, контрольна сума |
| `StorageModule` | `StorageService` | put / get / delete об'єктів через S3 API |
| `PrismaModule` | `PrismaService` | доступ до БД |

Prisma-моделі:

```
User      { id uuid, email string unique, displayName string, passwordHash string, createdAt DateTime }
Workspace { id uuid, ownerId → User unique, createdAt DateTime }
FileEntry { id uuid, workspaceId → Workspace, name string, extension string, size int,
            checksum string, storageKey string, createdAt DateTime, modifiedAt DateTime,
            uploadedById → User, editedById → User }
unique (workspaceId, name)
```

`storageKey = workspaces/{workspaceId}/{fileEntry.id}` у бакеті `shelf`. Завантаження файлу з
наявним ім'ям **оновлює** запис (UC10): той самий `FileEntry` і ключ, нові байти, `modifiedAt` =
now, `editedById` = поточний користувач, новий `checksum` (SHA-256, обчислюється сервером).

DTO: `RegisterDto {email, password, displayName}`, `LoginDto {email, password}`,
`AuthResponseDto {accessToken, user: UserDto}`, `UserDto {id, email, displayName}`,
`FileEntryDto {id, name, extension, size, checksum, createdAt, modifiedAt, uploadedBy, editedBy}`
(`uploadedBy` / `editedBy` — `displayName`).

REST API (префікс `/api`; усі маршрути, крім `auth/register`, `auth/login` і `health`, вимагають `Authorization: Bearer <jwt>`):

| Метод | Шлях | Тіло / параметри | Відповідь |
|---|---|---|---|
| POST | `/api/auth/register` | `RegisterDto` | `AuthResponseDto` |
| POST | `/api/auth/login` | `LoginDto` | `AuthResponseDto` |
| GET | `/api/auth/me` | — | `UserDto` |
| GET | `/api/workspace` | — | `{id, owner: UserDto, fileCount}` |
| GET | `/api/workspace/files` | — | `FileEntryDto[]` |
| POST | `/api/workspace/files` | multipart `file` | `FileEntryDto` (201 — новий, 200 — оновлено) |
| GET | `/api/workspace/files/:id` | — | `FileEntryDto` |
| GET | `/api/workspace/files/:id/content` | — | байти, `Content-Type`, `Content-Disposition` |
| DELETE | `/api/workspace/files/:id` | — | 204 |
| GET | `/api/health` | — | `{status: "ok"}` (перевірка стану контейнера) |

Помилки: 400 — валідація (`class-validator`), 401 — немає / протух JWT, 404 — файл не в цьому
просторі, 409 — email зайнятий, 413 — перевищено 50 МБ. Swagger на `/api/docs` (увімкнено за
замовчуванням; `SWAGGER_ENABLED=false` вимикає його; на опублікованому сервері його залишено
увімкненим, §9).

## 7. Клієнти

### 7.1. Монорепозиторій

```
shelf/
  apps/api/          NestJS 11, Prisma, PostgreSQL, S3 SDK, JWT
  apps/desktop/      Electron + React + Vite (electron-vite)
  apps/web/          Next.js (App Router)
  packages/shared/   @shelf/shared — типи, переліки, чисті функції, FileApiClient, SyncEngine
  packages/ui/       @shelf/ui — презентаційні React-компоненти без Next-специфіки
  docker/            compose для локальної розробки (postgres, minio, api)
  docs/specs/        цей документ
  docs/uml/          drawio/ (редаговані), img/ (svg + png)
  docs/reports/      звіти етапів (md → docx / pdf)
  tools/             збірка звітів; tools/uml-gen/ — локальний генератор діаграм, поза git
```

Менеджер пакетів — pnpm workspaces. Обидва клієнти працюють з одним REST API. Сортування,
фільтр, видимість стовпців, вибір способу перегляду і план синхронізації обчислюються
**на клієнті** у `@shelf/shared`.

### 7.2. `@shelf/shared`

| Файл | Вміст |
|---|---|
| `types.ts` | переліки з §3 як `const`-об'єкти з однойменними типами; `FileEntryDto`, `UserDto`, `AuthResponseDto`, `RegisterDto`, `LoginDto`, `WorkspaceDto`, `LocalFile` (`modifiedAt` — мілісекунди) |
| `hash.ts` | `sha256Hex` — SHA-256 через Web Crypto, той самий формат, що й `checksum` на сервері |
| `format.ts` | `formatSize`, `formatDateTime` |
| `fileListOperations.ts` | `sortByName`, `filterByType`, `getVisibleFiles`, `extensionOf` |
| `columns.ts` | `ColumnKey`, `ColumnVisibility`, `toggleColumn`, стовпець `name` не приховується |
| `preview.ts` | `previewKindOf(name): PreviewKind`, `FilePreview`, `TextPreview`, `ImagePreview`, `createPreview` |
| `fileApiClient.ts` | `FileApiClient`: `register`, `login`, `me`, `listFiles`, `upload`, `download`, `remove` |
| `sync/fileNames.ts` | `isSafeFileName`, `isSyncableName` (приховані файли й `__proto__` не синхронізуються), `nameKey`, `collidingNames` (імена, що збігаються без урахування регістру й форми Unicode) |
| `sync/localFolder.ts` | інтерфейс `LocalFolder` (`listFiles`, `read`, `write`, `checksum` — операція `LocalFile.checksum()` з діаграми класів виконується папкою), `MemoryLocalFolder` для тестів |
| `sync/snapshot.ts` | `SyncSnapshot`, `SnapshotEntry`, інтерфейс `SnapshotStore { load(), save() }`. На діаграмі послідовності 05 лінія життя `SnapshotStore` позначає знімок разом з його сховищем: `load()` і `save()` належать сховищу, `put(SnapshotEntry)` — знімку. Записи читаються через `getEntry` — лише власні ключі об'єкта. |
| `sync/syncPlanner.ts` | `computeStatus({local, remote, snapshot, localChecksum}): SyncStatus`, `buildItems`, `defaultSide`, `decideDirection` — чисті функції |
| `sync/syncEngine.ts` | `SyncEngine` (§3): `scan()`, `conflicts()`, `resolve(name, keep)`, `synchronize(onProgress?)`; приймає `LocalFolder`, `SnapshotStore`, `SyncApi` |
| `limits.ts` | `MAX_UPLOAD_MB = 50`, `splitBySize` |

### 7.3. `@shelf/ui`

Презентаційні компоненти, спільні для десктопа і веба: `AuthForm`, `WorkspaceLayout`
(бічна панель + вміст; вужче 768 px панель відкривається кнопкою меню поверх вмісту),
`FileTableView`, `SortHeaderControl`, `TypeFilterControl`, `ColumnPicker`, `PreviewDialog`,
`UploadDropzone`, `SyncPanel`, `ConflictDialog`, `SyncReportView`. Також: `Banner`, `Button`,
`Modal`, `UploadButton`, `SidebarSection`, хук `useFileListController` — керівний клас
`FileListController` з VOPC — і `describeUpload` (текст повідомлення після завантаження). Стилі —
Tailwind зі спільним пресетом. Жодних `next/*` імпортів.

**Вигляд (принцип, деталі на етапі 2):** ліва бічна панель з назвою простору, користувачем,
блоком синхронізації (папка, перемикач відстеження, кнопка) і перемикачами стовпців; основна
область — панель інструментів (сортування, фільтр, завантаження) над таблицею; перегляд
вмісту відкривається як модальне вікно; конфлікти — окремий діалог зі списком. Це свідомо
інша компоновка, ніж у типових рішень з панеллю перегляду праворуч.

### 7.4. `apps/desktop`

- **main**: `SettingsStore` (`userData/settings.json`: адреса сервера, шлях папки, перемикач
  відстеження), `NodeLocalFolder` (`fs`), `JsonSnapshotStore`
  (`userData/snapshots/<sha1 шляху папки>.json`, один файл на папку), `FolderWatcher`
  (`chokidar`), `SyncService` (обгортка `SyncEngine`: `scan`, `run(resolutions)`, `cancel`,
  `autoSync`), `FileTransfers` (`saveAs`, `prepareDrag`/`startDrag` через
  `webContents.startDrag`), `registerIpc` (обробники IPC і діалог вибору папки).
- **preload**: міст `window.shelf` (`ShelfBridge`).
- **renderer**: React; екрани `LoginScreen`, `WorkspaceScreen`, хук `useDesktopSync`;
  `FileListController` — хук `useFileListController` з `@shelf/ui`.
- Синхронізація виконується в main-процесі (доступ до `fs`), UI отримує прогрес через IPC.

### 7.5. `apps/web`

- Next.js 16 (App Router); усі сторінки — клієнтські компоненти. Маршрути: `/login`, `/register`,
  `/workspace`; `/` веде на `/workspace` або `/login` залежно від сесії. Сесія (JWT і користувач) —
  у `localStorage`, як у десктопі; збережений токен перевіряється через `GET /api/auth/me`, і
  відповідь 401 (зокрема прострочений токен посеред роботи) повертає на `/login`. Адреса API
  фіксована для збірки (`NEXT_PUBLIC_API_URL`, за замовчуванням `http://localhost:4000`), тому поля
  «Адреса сервера» на екрані входу немає.
- Екрани `LoginScreen` і `WorkspaceScreen` зібрано з `@shelf/ui`: вигляд і `data-testid` ті самі, що
  в десктопі.
- Drag-and-drop завантаження через `UploadDropzone`, файли понад 50 МБ відсіюються до запиту.
  Скачування: байти отримуються `FileApiClient.download` з токеном і зберігаються через тимчасовий
  object URL і `<a download>` — звичайне посилання не може передати заголовок `Authorization`.
- Синхронізація (Chrome, Edge): `BrowserLocalFolder` на File System Access API
  (`showDirectoryPicker`); дозвіл на папку перевіряється перед кожною дією, а запитується лише після
  натискання «Синхронізувати» (Chrome забуває його після перезавантаження сторінки). В IndexedDB —
  `IndexedDbSnapshotStore` (знімок для кожної прив'язки) і `FolderBindingStore` (handle папки і
  перемикач відстеження для кожного облікового запису). Службові файли Chrome `*.crswap` не
  синхронізуються. Збій вибору папки має власне повідомлення (`explainPickerError`), а помилки
  браузера (`DOMException` File System Access і IndexedDB) перекладаються українською
  (`explainBrowserError`); поки відкрито вікно вибору папки чи запит дозволу, кнопки блоку
  синхронізації вимкнені.
- Автоматичне відстеження — `WebSyncService` з хуком `useWebSync`: браузер не повідомляє про зміни в
  папці, тож поки перемикач увімкнено і вкладка видима, список файлів (назви, розміри, час зміни)
  перечитується кожні 5 с, і синхронізація запускається лише тоді, коли він змінився. Запобіжники —
  як у десктопному `SyncService`: один запуск одночасно; відкритий `ConflictDialog` притримує
  автоматичні запуски; ручна синхронізація спершу запитує дозвіл на папку, а потім чекає на
  автоматичну; результат запуску попереднього облікового запису чи папки відкидається.
- У браузерах без File System Access API (Firefox, Safari) блок синхронізації показує пояснення
  замість кнопок; решта функцій працює.
- `transpilePackages: ['@shelf/shared', '@shelf/ui']`. Розгортання — Vercel: корінь проєкту
  `apps/web`, команди встановлення і збірки — `apps/web/vercel.json`.

## 8. Тестування

Vitest у `@shelf/shared` (мінімум для етапу 2):

1. `sortByName` — зростання і спадання, нечутливість до регістру, числові суфікси.
2. `filterByType` — `ONLY_CPP`, `ONLY_PNG`, `ALL_FILES`; порядок після фільтра збережено.
3. `previewKindOf` — `.kt` → `TEXT`, `.jpg` → `IMAGE`, `.zip` → `NONE`.
4. `computeStatus` — усі шість статусів, зокрема `CONFLICT` за знімком і без знімка.

Jest у `apps/api`: `AuthService`, `FilesService` (оновлення версії змінює `editedBy`,
`modifiedAt`, `checksum`), `StorageService` з моком S3. Vitest у `apps/desktop`: `SettingsStore`,
`NodeLocalFolder`, `JsonSnapshotStore`, `FolderWatcher`, `SyncService` і `SyncEngine` на справжній
файловій системі (тимчасова папка) з in-memory API; `SyncEngine` з in-memory `LocalFolder` — у
`@shelf/shared`. Vitest у `apps/web` (середовище node, без браузера): сесія, `BrowserLocalFolder`
на in-memory handle-ах із поведінкою Chromium (скачаний файл не вважається зміненим, `*.crswap`
пропускаються, невдале скачування нового файлу не залишає порожнього файлу),
`fileSystemAccess.test.ts` (визначення підтримки API і допоміжна функція дозволу),
`browserErrors.test.ts` (переклад помилок браузера), `IndexedDbSnapshotStore` і `FolderBindingStore`
на `fake-indexeddb`, `WebSyncService` з in-memory API і керованим таймером. Наскрізні перевірки UI
обох клієнтів — Playwright (`pnpm -F @shelf/desktop smoke`, `pnpm -F @shelf/web smoke`; у вебі
папка синхронізації — каталог Origin Private File System).

## 9. Розгортання

- **Локально**: `docker/compose.yml` — PostgreSQL 16, MinIO, api; клієнти запускаються з
  вихідників. Локальні порти: PostgreSQL 5433, MinIO 9100 (консоль 9101), API 4000.
  Seed створює трьох користувачів, кожен зі своїм робочим простором і демонстраційними
  файлами; це показує ізоляцію просторів (id чужого файлу дає 404). У цій моделі колонки «хто
  завантажив» / «хто редагував» показують власника простору; вони відрізнялися б лише за спільних
  папок, які поза межами проєкту (§1.3).
- **Production** (бонус етапу 3), розгорнуто на безкоштовних планах, як на діаграмі 10, з двома
  уточненнями (API слухає порт зі змінної `PORT`, сторінки Next.js статичні, без SSR):
  - веб — Vercel (Hobby), https://shelf-opal-two.vercel.app: корінь проєкту `apps/web`, команди
    встановлення і збірки — `apps/web/vercel.json`; `NEXT_PUBLIC_API_URL` задано змінною проєкту
    і вбудовано в збірку, без неї `next.config.ts` зупиняє збірку на Vercel;
  - API — Render, Docker web service з `render.yaml` (Blueprint, регіон Frankfurt),
    https://shelf-api-l989.onrender.com: образ з `docker/api.Dockerfile`, під час запуску
    `prisma migrate deploy`, перевірка стану `/api/health`; секрети (`DATABASE_URL`, адресу,
    регіон і ключі S3, `CORS_ORIGINS`) введено в панелі Render, `JWT_SECRET` згенерував Render; Swagger увімкнено;
  - БД — Neon PostgreSQL (Frankfurt); `DATABASE_URL` — пряме з'єднання без пулера, бо цю саму
    змінну використовує `prisma migrate deploy`;
  - сховище — Supabase Storage через S3-сумісний ендпоінт (адресація за шляхом, бакет `shelf`);
  - CORS — `*` (сервер повторює `Origin` запиту): сесія передається токеном у заголовку
    `Authorization`, а не cookie, тож чужа сторінка без токена нічого не отримає; до API звертаються
    і сайт, і сторінка десктопа з локального файлу;
  - демонстраційні дані записано через публічний REST API тим самим скриптом:
    `SHELF_API=https://shelf-api-l989.onrender.com pnpm seed`;
  - обмеження: Render засинає після 15 хв без запитів (перший запит — до хвилини, клієнт показує
    підказку), Supabase призупиняє безкоштовний проєкт після 7 днів без активності.
- CI: GitHub Actions — `pnpm build` + `pnpm test` на push і pull request.

## 10. Набір діаграм етапу 1

| № | Файл | Тип | Що показує |
|---|---|---|---|
| 01 | `01-use-case` | прецедентів | UC1–UC15 каскадом, кольори груп |
| 02 | `02-class-domain` | класів | доменна модель §3 |
| 03 | `03-class-vopc-sort-filter` | класів (VOPC) | UC5 + UC6, §4 |
| 04 | `04-activity-sync` | активності | UC14 з доріжками «User» / «Client (SyncEngine)» / «Server (REST API)» |
| 05 | `05-sequence-sync` | послідовності | UC14: `SyncPanel` → `SyncEngine` → `LocalFolder`, `SnapshotStore`, `FileApiClient`; `alt` за статусами, `ConflictDialog` |
| 06 | `06-sequence-preview` | послідовності | UC8: клік → `FileListController` → `FileApiClient.download` → `createPreview` → `TextPreview` / `ImagePreview` → `PreviewDialog` |
| 07 | `07-communication-sort-filter` | комунікації | UC5 + UC6, повідомлення §4 |
| 08 | `08-state-file` | станів | життєвий цикл файлу під час синхронізації, §5.5 |
| 09 | `09-component` | компонентів | desktop, web, `@shelf/shared`, `@shelf/ui`, модулі сервера, сховище, БД |
| 10 | `10-deployment` | розгортання | робоча станція (Electron, папка), браузер, Render, Neon, Supabase Storage, Vercel |

Підписи на діаграмах — англійською, текст звіту — українською. Кожна діаграма у звіті має
абзац «Пояснення». Мінімум завдання (прецедентів 1+, класів 2+, активності 1+, взаємодії 2+,
станів 1+, компонентів 1+, розгортання 1+) покрито з запасом.

Інструменти: генератор `tools/uml-gen/` (Python + Graphviz для розкладки, експорт PNG/SVG
через CLI draw.io) не входить у репозиторій; у git — лише `.drawio`, `.svg`, `.png`.

## 11. Звіти

Структура звіту етапу 1: титульна сторінка → зміст → постановка задачі → аналіз вимог (дійові
особи, функціональні й нефункціональні вимоги, глосарій, перелік прецедентів) → високорівневе
проєктування (архітектура, компоненти, розгортання) → деталізоване проєктування (решта діаграм,
кожна з поясненням) → висновки.

Титульна сторінка: Київський національний університет імені Тараса Шевченка; «Звіт до
лабораторної роботи №1 на тему: „Розробка клієнта для взаємодії з віддаленою папкою з файлами.
Етап 1, варіант 8-6"»; студента четвертого курсу групи МІ-41 факультету комп'ютерних наук та
кібернетики Мекшакова Артемія Олексійовича; Київ-2026.

Збірка: Markdown → pandoc → DOCX і PDF (xelatex, Times New Roman 12 pt). У Word вставляються
`.svg`.

## 12. Словник термінів для звіту

| Ідентифікатор | Український термін |
|---|---|
| Workspace | простір (віртуальний диск) користувача |
| FileEntry | запис про файл (метадані) |
| FileContent | вміст файлу (об'єкт у сховищі) |
| FilePreview / TextPreview / ImagePreview | перегляд вмісту; текстовий і графічний перегляд |
| LocalFolder / LocalFile | прив'язана локальна папка; локальний файл |
| SyncSnapshot | знімок стану після останньої синхронізації |
| SyncItem / SyncStatus / Side | елемент плану синхронізації; його статус; сторона (локальна / віддалена) |
| SyncEngine / SyncReport | рушій синхронізації; звіт про синхронізацію |
| SortDirection / TypeFilter | напрям сортування; фільтр за типом |
| FileListOperations | операції над списком файлів (сортування, фільтр) |
