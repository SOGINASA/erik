# erik

Волонтёрская платформа Казахстана с честным **прогнозом явки** на сборы.
Проект хакатона **Tech Vision 2026** · направление Social & Human Capital · Community Engagement.

Ядро продукта: координатор локальной инициативы получает не поток «+» из чата, а
честное число — «сколько людей реально придёт» — за 24 часа до сбора, с интервалом
неопределённости и списком тех, на кого можно рассчитывать.

## Монорепозиторий

```
erik/
├── front/   — React-приложение (этот код)
└── back/    — бэкенд (пока пусто)
```

## Стек

- **React 19** + **Create React App** (react-scripts 5)
- **JavaScript** (без TypeScript)
- **Tailwind CSS v4** — токены дизайн-системы; компилируется отдельным `@tailwindcss/cli`
  (см. ниже «Почему Tailwind через CLI»)
- **Zustand 5** — состояние (4 стора: session / ui / gathering / platform)
- **react-router-dom 7** — роутинг
- Анимации — на CSS (keyframes из дизайн-системы), без сторонних libs

> Примечание: изначальное ТЗ предполагало Vite + TypeScript + Framer Motion.
> По решению команды стек оставлен на CRA + JavaScript; дизайн-система, архитектура,
> сторы и мат-модель перенесены в полном объёме.

## Локальный запуск

```bash
cd front
npm install
npm start        # tailwind --watch + react-scripts, http://localhost:3000
npm run build    # прод-сборка (сначала компилит CSS, затем webpack)
npm test         # юнит-тесты мат-модели прогноза
```

## Архитектура

```
front/src/
├── index.css              — токены (@theme + CSS-переменные), keyframes, база
├── i18n.js                — словарь RU/KZ + хуки useT / useLang
├── lib/
│   ├── forecast.js        — МАТ-МОДЕЛЬ ПРОГНОЗА (ядро) + forecast.test.js
│   ├── data.js            — демо-данные, генератор участников, хелперы
│   └── nav.js             — роут-хелперы, гвард входа, брейкпоинт, счётчик непрочитанных
├── store/                 — Zustand: useSessionStore, useUiStore, useGatheringStore, usePlatformStore
├── components/
│   ├── shell/Shell.js     — сайдбар (десктоп) / шапка + таббар (мобиль)
│   ├── AttendanceBar.js   — «Полоса явки» (signature-элемент, 3 стиля)
│   ├── ForecastBlock.js   — блок прогноза с анимацией числа
│   ├── EventCard, PersonRow, Container, Icon
│   └── ui/                — Button, Avatar, controls, AnswerButton, Sheet, feedback
├── pages/                 — экраны (см. карту роутов)
└── sheets/Sheets.js       — все листы/модалки (11 типов)
```

### Карта роутов

```
/                 лендинг            /c/:id            сбор — координатор (дом продукта)
/onboarding       выбор роли         /c/:id/check      отметка явки
/g/:code          сбор — участник    /me               мои сборы
/feed             лента              /u/:id            профиль
/map              карта              /o/:id            организация (НКО)
/e/:id            событие            /leaderboard      рейтинг
/new              создание сбора     /charity          нужна помощь
/messages(/:id)   сообщения          /notifications    уведомления
/admin            модерация          *                 404
```

## Мат-модель прогноза (ядро)

Для участника *i*: `p_i = clamp(base(answer) · trust_i · ctx, 0.02, 0.98)`, где
`trust_i = (came_i + α·base) / (total_i + α)` (сглаживание Лапласа, α=3).
Прогноз `E = Σ p_i`, разброс `σ = √Σ p_i(1−p_i)`, интервал ≈ `E ± 2σ`.
Каждая отметка явки уточняет `trust` — продукт становится точнее от использования.
Покрыт юнит-тестами (`src/lib/forecast.test.js`) — это единственный тестируемый кусок,
и это ядро продукта.

## Честные пометки (по регламенту)

- **Данные синтетические.** Демо-сбор, участники, НКО, города, рейтинги, сообщения —
  сгенерированы детерминированно для показа. `base`-вероятности модели взяты из первых
  интервью CustDev и на реальных сборах пересчитываются.
- **Тёмная тема не делается** — осознанное решение MVP (полдня работы ради нуля баллов).
- **Полная поддержка казахской кириллицы** (ә ғ қ ң ө ұ ү һ і) во всех трёх шрифтах.

## Почему Tailwind через CLI

Create React App (webpack/css-loader) инлайнит `@import "tailwindcss"` раньше, чем
PostCSS-плагин Tailwind v4 успевает сгенерировать утилиты, — классы не попадают в сборку.
Поэтому CSS компилируется отдельным шагом `@tailwindcss/cli` (`src/index.css → src/output.css`),
а `npm start` запускает его в watch-режиме параллельно с dev-сервером через `concurrently`.
