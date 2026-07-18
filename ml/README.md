# ml — прогноз явки волонтёра на следующий сбор

Модель отвечает на один вопрос: **придёт ли волонтёр на следующий сбор?**
Она смотрит на то,

- **сколько раз он приходил** на прошлые сборы и **сколько пропускал**,
- и **какие темы ему интересны** (совпадает ли тема сбора с его интересами).

Это дополняет мат-модель прогноза из `front/src/lib/forecast.js` /
`backend/services/forecast.py`: та даёт быструю аналитическую оценку `p_i` по формуле
доверия (сглаживание Лапласа), а эта — обучаемую ML-модель, которая ловит нелинейные
зависимости (интерес × тема × свежесть × ответ) и выдаёт калиброванную вероятность.

> **Данные синтетические.** Реальной истории сборов пока нет, поэтому журнал явки
> генерируется правдоподобно (`data_gen.py`). Типы мероприятий тоже синтетические —
> первые 7 совпадают с `backend/seed.py` (eco / elderly / animals / blood / edu / trees /
> homeless), остальные (medical / disaster / sport / culture / it) добавятся во фронт и
> бэк позже. Все константы — в `config.py`.

## Структура

```
ml/
├── config.py       — типы мероприятий, имена признаков, пути к артефактам
├── data_gen.py     — генератор синтетического журнала явки (ground truth)
├── features.py     — инженерия признаков, ОБЩАЯ для обучения и инференса
├── train.py        — обучение модели + сохранение артефактов
├── evaluate.py     — метрики: accuracy, F1, precision/recall, ROC-AUC, матрица ошибок
├── inference.py    — предсказание для (волонтёр, сбор): класс + функция + CLI
├── requirements.txt
├── data/           — сгенерированные CSV (в .gitignore)
└── artifacts/      — обученная модель, metrics.json, графики (в .gitignore)
```

## Установка

```bash
cd ml
python -m venv .venv && . .venv/Scripts/activate   # Windows PowerShell: .\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

## Как запустить (полный цикл)

```bash
python data_gen.py            # (необязательно) сгенерировать журнал явки → data/events.csv
python train.py               # обучить модель (по умолчанию — градиентный бустинг)
python evaluate.py            # полные метрики + графики в artifacts/
python inference.py --demo    # показательные предсказания
```

`train.py` сам сгенерирует данные, если их ещё нет. Модели на выбор:

```bash
python train.py --model gboost   # HistGradientBoosting (по умолчанию, сильнее всех)
python train.py --model forest   # RandomForest
python train.py --model logreg   # LogisticRegression (интерпретируемый базлайн)
python train.py --regenerate     # перегенерировать данные заново
```

## Признаки модели

Считаются **причинно** — только по истории волонтёра ДО текущего сбора (без утечки):

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

Чтобы обучение и продакшен собирали одинаковый вектор, оба идут через
`features.compute_feature_row()` — нет train/serve skew.

## Метрики (`evaluate.py`)

- **Accuracy** — доля верных предсказаний;
- **Precision / Recall / F1** — по классам «придёт»/«не придёт» и усреднённые (macro/weighted);
- **ROC-AUC**, **PR-AUC** — качество ранжирования вероятностей (не зависит от порога);
- **Log-loss**, **Brier score** — калибровка вероятностей;
- **матрица ошибок** и `classification_report`;
- автоподбор оптимального порога по F1.

Результаты пишутся в `artifacts/metrics.json`, графики — `confusion_matrix.png`, `roc_curve.png`.
Тест честный: сплит **по волонтёрам** (`GroupShuffleSplit`) — история одного человека не
попадает разом в train и test.

## Инференс из бэкенда

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
так что бэкенд может звать модель, имея лишь `User.trust_came` / `User.trust_total`,
`skills`/интересы и тему сбора. `total` можно заменить парой `came` + `missed`.

## Как это ложится на бэкенд

- `history.came`  ← `User.trust_came`
- `history.total` ← `User.trust_total` (или `came` + `missed`)
- `history.interests` ← интересы волонтёра (сейчас близко к `User.skills`; отдельный
  справочник тем-интересов добавится позже)
- `event.event_type` ← `Gathering.theme`
- `event.answer` ← `Participant.answer`
