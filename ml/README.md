# erik · ml — прогноз явки волонтёра

Обучаемая модель отвечает на один вопрос: **придёт ли конкретный волонтёр на следующий сбор?**
Это инженерное ядро продукта — то самое «честное число», которое убирает у новичка страх
«приду — а вдруг я одна?».

Корневой обзор — [../README.md](../README.md). Как это ложится на API — [../backend/README.md](../backend/README.md).

## Зачем отдельная модель (а не обёртка над чужим API)

В erik два слоя прогноза, они дополняют друг друга:

- **Аналитический** (`../backend/services/forecast.py` = `../front/src/lib/forecast.js`) —
  быстрая формула доверия `p_i` со сглаживанием Лапласа. Прозрачна, покрыта юнит-тестами.
- **Обучаемый ML** (этот пакет) — ловит **нелинейные** зависимости
  (интерес × тема × свежесть × ответ) и выдаёт калиброванную вероятность.

Это собственная модель на собственных признаках — прямой ответ на критерий
«глубина интеграции AI: кастомные цепочки, а не пустые обёртки над API».

**Что модель даёт сверх формулы** (одинаковый отложенный тест, сплит по волонтёрам —
воспроизводится `python baseline.py`):

| предсказатель | ROC-AUC | Brier | ожидаемая явка Σp (факт = 3116) |
|---|---|---|---|
| «по ответу» (повторяет число подтвердивших) | 0.698 | 0.199 | 3226 |
| матформула `base·trust·ctx` | 0.753 | 0.322 | 1334 (−57%) |
| **модель (калибр.)** | **0.793** | **0.175** | **3188 (−2.3%)** |

Наивная ставка «по ответу» может угадать *сумму*, но не ранжирует, **кто именно**
придёт (ROC-AUC 0.70). Модель и ранжирует (0.79), и попадает в агрегат с ошибкой ~2% —
потому что учит надёжность, интерес и свежесть. Полный паспорт — [MODEL_CARD.md](MODEL_CARD.md).

Модель смотрит на:

- **сколько раз волонтёр приходил** на прошлые сборы и **сколько пропускал**;
- **какие темы ему интересны** — совпадает ли тема сбора с его интересами;
- **свежесть** активности (динамика последних сборов, дней с последнего).

> **Данные синтетические.** Реальной истории сборов пока нет, поэтому журнал явки
> генерируется правдоподобно (`data_gen.py`). Первые 7 типов мероприятий совпадают с
> `../backend/seed.py` (eco / elderly / animals / blood / edu / trees / homeless), остальные
> (medical / disaster / sport / culture / it) добавятся во фронт и бэк позже.
> Все константы — в `config.py`.

## Структура

```
ml/
├── config.py       — типы мероприятий, имена признаков, пути к артефактам
├── data_gen.py     — генератор синтетического журнала явки (ground truth)
├── features.py     — инженерия признаков, ОБЩАЯ для обучения и инференса
├── train.py        — обучение модели + изотоническая калибровка + артефакты
├── evaluate.py     — метрики (ROC-AUC, Brier, …) + permutation importance
├── baseline.py     — сравнение модели с «формульными» базлайнами (доказательство)
├── inference.py    — предсказание для (волонтёр, сбор): класс + функция + CLI
├── MODEL_CARD.md   — паспорт модели: данные, метрики, базлайны, ограничения
├── requirements.txt
├── data/           — сгенерированные CSV (в .gitignore, регенерируются)
└── artifacts/      — обученная модель + metrics/baselines/importance + графики (В ГИТЕ)
```

## Запуск (полный цикл)

```bash
cd ml
python -m venv .venv
. .venv/Scripts/activate                 # Windows PowerShell: .\.venv\Scripts\Activate.ps1
pip install -r requirements.txt

python data_gen.py            # (необязательно) сгенерировать журнал → data/events.csv
python train.py               # обучить модель + калибровку (данные сгенерирует сам)
python evaluate.py            # метрики + permutation importance + графики
python baseline.py            # сравнить модель с формульными базлайнами
python inference.py --demo    # показательные предсказания
```

Модели на выбор:

```bash
python train.py --model gboost   # HistGradientBoosting (по умолчанию, сильнее всех)
python train.py --model forest   # RandomForest
python train.py --model logreg   # LogisticRegression (интерпретируемый базлайн)
python train.py --regenerate     # перегенерировать данные заново
```

## Признаки

Считаются **причинно** — только по истории волонтёра ДО текущего сбора (без утечки будущего):

| признак | смысл |
|---|---|
| `events_total`, `events_came`, `events_missed` | сколько сборов было / **приходил** / **пропускал** |
| `attendance_rate` | доля явок со сглаживанием Лапласа (как `trust` в forecast) |
| `reliability` | 0..100, как `User.reliability` на бэке |
| `recent_came_rate` | явка за последние `RECENT_WINDOW` сборов (свежая динамика) |
| `days_since_last` | дней с прошлого сбора (свежесть) |
| `theme_total`, `theme_came`, `theme_attendance_rate` | история **именно по теме** этого сбора |
| `interest_match` | входит ли тема сбора в **интересы** волонтёра |
| `num_interests` | сколько тем интересно волонтёру |
| `answer` | ответ на приглашение: yes / maybe / no |
| `event_type` | тип мероприятия (тема) |

**Целевая переменная:** `came` — 1 (придёт) / 0 (не придёт).

Обучение и продакшен собирают вектор через одну функцию `features.compute_feature_row()` —
никакого train/serve skew.

## Метрики (`evaluate.py`)

- **Accuracy**; **Precision / Recall / F1** по классам и усреднённые (macro / weighted);
- **ROC-AUC**, **PR-AUC** — качество ранжирования (не зависит от порога);
- **Log-loss**, **Brier score** — калибровка вероятностей;
- **матрица ошибок**, `classification_report`, автоподбор порога по F1.

Результаты → `artifacts/metrics.json`; графики → `confusion_matrix.png`, `roc_curve.png`.
Тест честный: сплит **по волонтёрам** (`GroupShuffleSplit`) — история одного человека не
попадает разом в train и test.

## Инференс

```python
from inference import AttendancePredictor

predictor = AttendancePredictor()             # грузит модель один раз при старте
result = predictor.predict(
    history={"came": 7, "total": 10,          # приходил 7 из 10 (пропустил 3)
             "theme_came": 3, "theme_total": 3,
             "interests": ["eco", "trees"],
             "recent_came_rate": 0.8, "days_since_last": 12},
    event={"event_type": "eco", "answer": "yes"},
)
# → {"will_attend": True, "probability": 0.87, "label": "придёт", "confidence": "высокая", ...}
```

Поля `history` (кроме `came`/`total`) необязательны — есть разумные значения по умолчанию,
так что бэкенд может звать модель, имея лишь `User.trust_came` / `User.trust_total`, интересы
и тему сбора. `total` можно заменить парой `came` + `missed`.

Маппинг на модели бэкенда:

| поле инференса | источник на бэке |
|---|---|
| `history.came` / `history.total` | `User.trust_came` / `User.trust_total` |
| `history.interests` | интересы волонтёра (близко к `User.skills`) |
| `event.event_type` | `Gathering.theme` |
| `event.answer` | `Participant.answer` |

## Подключение к бэкенду

Мост — [`../backend/services/attendance_ml.py`](../backend/services/attendance_ml.py):
изолированно импортирует `inference.py` (у ml свои `config`/`features`, чтобы не столкнуться
с `backend/config.py`), грузит модель один раз и **мягко деградирует** — если ml-зависимостей
нет или модель не обучена, отдаёт `{'available': false, 'reason', 'hint'}`, а не роняет сервер.

Эндпоинт (только координатор-владелец):

```
GET /api/gatherings/<id>/ml-forecast
→ { "available": true, "model": "gboost", "expected": 12.4, "needed": 20,
    "participants": [ {"id":1,"name":"…","answer":"yes",
                       "probability":0.87,"willAttend":true,"confidence":"высокая"}, … ] }
```

`expected` (сумма вероятностей) — ML-компаньон аналитического `E` из `/forecast`.
Клиент: `api.mlForecast(id)` в [`../front/src/lib/api.js`](../front/src/lib/api.js).

> Обученный артефакт (`artifacts/attendance_model.joblib`) **закоммичен в репозиторий**,
> поэтому в проде переобучать не нужно — достаточно ml-зависимостей в окружении бэкенда
> (`pip install -r ml/requirements.txt`). Если зависимостей нет — эндпоинт корректно
> отвечает `available:false` с подсказкой, бэкенд не падает.
