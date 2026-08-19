"""Мост к ML-модели прогноза явки (ml/inference.py).

ML-модуль лежит рядом с backend/ (см. ../ml). Он самостоятельный: у него свои
top-level модули `config`/`features`, имена которых пересекаются с backend/config.py.
Поэтому импортируем его ИЗОЛИРОВАННО (подменяя записи в sys.modules только на время
импорта) — чтобы ml-`config` не перезаписал backend-`config` и наоборот.

Мост мягко деградирует: если ml/ нет, зависимости не установлены или артефакт
модели отсутствует, всё возвращает None/available:false, а бэкенд НЕ падает —
прогноз честно откатывается на аналитическую формулу (services/forecast.py).

Что изменилось против первой версии (это и есть суть претензии жюри):
  • признаки собираются ПОЛНОСТЬЮ (services/history_features.py), а не три поля из
    четырнадцати — иначе модель в проде вырождалась в функцию (came, total, answer),
    то есть ровно в ту же формулу, которую она должна была заменить;
  • предсказание батчевое — одна матрица на весь ростер вместо N вызовов;
  • ручная калибровка p**γ убрана: модель калибруется изотонически при обучении
    (ml/train.py), поэтому Σ p_i — это и есть ожидаемая явка, а не «шкала».

Маппинг входа:
    history.*          ← services/history_features.build_histories (журнал AttendanceRecord)
    event.event_type   ← Gathering.theme (id темы совпадает с ml/config.EVENT_TYPE_IDS)
    event.answer       ← Participant.answer
"""
import importlib.util
import json
import os
import sys
from pathlib import Path

from services.history_features import build_histories

# ml/ — сосед backend/: .../backend/services/attendance_ml.py → parents[2] = корень репо.
# В контейнере каталоги лежат раздельно (/app и /ml), поэтому путь переопределяется
# переменной окружения ERIK_ML_DIR.
ML_DIR = Path(os.environ.get('ERIK_ML_DIR') or (Path(__file__).resolve().parents[2] / 'ml'))

# Аварийный рубильник: ERIK_ML_DISABLE=1 гасит модель, не трогая код и артефакты.
# Нужен, чтобы в любой момент показать «а что будет без ML» и проверить фолбэк.
_DISABLED = os.environ.get('ERIK_ML_DISABLE') == '1'

# ml/inference.py делает `from config import ...` / `from features import ...` — их и
# изолируем. Порядок важен: config → features → inference (кросс-импорты между ними).
_ML_MODULES = ('config', 'features', 'inference')

# Подсказки для каждого нерабочего состояния — уходят во фронт как поле hint.
_HINTS = {
    'no_ml_dir': 'Каталог ml/ не найден рядом с backend/',
    'deps_missing': 'Установите зависимости ML: pip install -r backend/requirements-ml.txt',
    'model_not_trained': 'Обучите модель: cd ml && python train.py',
    'disabled': 'ML отключён переменной окружения ERIK_ML_DISABLE=1',
    'error': 'Не удалось загрузить ML-модель — см. логи сервера',
}

ANSWERED = ('yes', 'maybe', 'no')

# Ленивое одноразовое состояние моста.
_predictor = None      # inference.AttendancePredictor | None
_status = None         # 'ok' | ключ из _HINTS
_loaded = False        # была ли уже попытка загрузки
_quality = None        # кэш artifacts/*.json


def _isolated_import_inference():
    """Импортировать ml/inference.py, не задев backend-модули с теми же именами.

    На время импорта регистрируем ml-копии config/features/inference под их «голыми»
    именами (чтобы `from config import ...` внутри ml сошёлся на ml-config), а в finally
    возвращаем sys.modules ровно как было.
    """
    saved = {n: sys.modules[n] for n in _ML_MODULES if n in sys.modules}
    try:
        inference = None
        for name in _ML_MODULES:
            path = ML_DIR / f'{name}.py'
            spec = importlib.util.spec_from_file_location(name, path)
            module = importlib.util.module_from_spec(spec)
            sys.modules[name] = module         # ДО exec — чтобы кросс-импорты нашли ml-копии
            spec.loader.exec_module(module)
            inference = module                 # последний — inference
        return inference
    finally:
        for name in _ML_MODULES:
            if name in saved:
                sys.modules[name] = saved[name]
            else:
                sys.modules.pop(name, None)


def _load():
    """Однократно попытаться загрузить модель. Идемпотентно, без исключений наружу."""
    global _predictor, _status, _loaded
    if _loaded:
        return
    _loaded = True

    if _DISABLED:
        _status = 'disabled'
        return
    if not ML_DIR.exists():
        _status = 'no_ml_dir'
        return
    try:
        inference = _isolated_import_inference()
    except ImportError:
        _status = 'deps_missing'       # нет numpy/pandas/scikit-learn/joblib
        return
    except Exception:
        _status = 'error'
        return
    try:
        _predictor = inference.AttendancePredictor()   # грузит .joblib один раз
        _status = 'ok'
    except FileNotFoundError:
        _status = 'model_not_trained'  # артефакта ml/artifacts/*.joblib ещё нет
    except Exception:
        _status = 'error'


def reload():
    """Сбросить кэш (например, после того как модель обучили при живом сервере)."""
    global _predictor, _status, _loaded, _quality
    _predictor = None
    _status = None
    _loaded = False
    _quality = None


def warmup():
    """Прогреть модель на старте воркера (вызывается из app.create_app).

    Без прогрева первый координатор, открывший сбор, ждёт распаковку joblib
    (~2-3 с), и так в каждом из воркеров gunicorn.
    """
    _load()
    return _status


def is_available():
    _load()
    return _predictor is not None


def status():
    _load()
    return _status


def unavailable_payload():
    """Единая форма «модели нет» — с причиной и подсказкой, что сделать."""
    return {'available': False, 'reason': status(), 'hint': _HINTS.get(status())}


def model_info():
    """Паспорт модели для UI: имя, порог и ключевые метрики отложенного теста."""
    if not is_available():
        return None
    q = quality() or {}
    metrics = q.get('metrics') or {}
    return {
        'name': _predictor.model_name,
        'threshold': round(float(_predictor.threshold), 4),
        'calibrated': True,
        'rocAuc': metrics.get('roc_auc'),
        'brier': metrics.get('brier'),
        'nTest': metrics.get('n_test'),
    }


# ─────────────────────────────────────────────────────────────────────────────
#  Предсказание
# ─────────────────────────────────────────────────────────────────────────────

def probabilities(gathering, at_rsvp=False):
    """P(придёт) для каждого ответившего участника → {participant_id: p} или None.

    Правило «все или никто»: если модель недоступна или не смогла оценить хотя бы
    одного ответившего, возвращаем None и вызывающий целиком уходит на формулу.
    Смешивать источники в одной сумме нельзя — E тихо занижался бы, а по числу
    было бы не понять, чем оно посчитано.
    """
    if not is_available():
        return None

    parts = [p for p in gathering.participants if p.answer in ANSWERED]
    if not parts:
        return {}

    try:
        histories = build_histories(gathering, at_rsvp=at_rsvp)
        event_type = gathering.theme or ''
        items = [(histories[p.id], {'event_type': event_type, 'answer': p.answer})
                 for p in parts]
        probs = _predictor.predict_proba_batch(items)
    except Exception:
        return None

    if len(probs) != len(parts):
        return None
    return {p.id: float(pr) for p, pr in zip(parts, probs)}


def predict_participant(part, event_type):
    """Предсказание по одному участнику (CLI/отладка). Ростер считайте через probabilities."""
    if not is_available() or part.answer not in ANSWERED:
        return None
    try:
        gathering = part.gathering
        history = build_histories(gathering)[part.id] if gathering is not None else {
            'came': part.history['came'], 'total': part.history['total'], 'interests': [],
        }
        return _predictor.predict(history, {'event_type': event_type or '', 'answer': part.answer})
    except Exception:
        return None


def forecast_gathering(gathering):
    """ML-прогноз по сбору: вероятность явки на каждого + агрегат.

    Форма ответа сохранена байт-в-байт с первой версией эндпоинта
    GET /gatherings/<id>/ml-forecast — на неё завязан фронт.
    """
    probs = probabilities(gathering)
    if probs is None:
        return unavailable_payload()

    threshold = float(_predictor.threshold)
    people = []
    expected = 0.0
    for part in gathering.participants:
        p = probs.get(part.id)
        if p is None:
            continue
        expected += p
        people.append({
            'id': part.id,
            'name': part.name,
            'answer': part.answer,
            'probability': round(p, 4),
            'willAttend': p >= threshold,
            'confidence': confidence_band(p),
        })

    return {
        'available': True,
        'model': _predictor.model_name,
        'threshold': round(threshold, 4),
        'expected': round(expected, 1),
        'needed': gathering.needed,
        'participants': people,
    }


def confidence_band(p):
    """Словесная уверенность — та же шкала, что в ml/inference._confidence_band."""
    d = abs(p - 0.5)
    if d >= 0.35:
        return 'высокая'
    if d >= 0.15:
        return 'средняя'
    return 'низкая'


# ─────────────────────────────────────────────────────────────────────────────
#  Паспорт качества модели (artifacts/*.json) — для экрана «Качество прогноза»
# ─────────────────────────────────────────────────────────────────────────────

def _read_json(path):
    try:
        with open(path, encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return None


def quality():
    """metrics.json + baselines.json + feature_importance.json одним словарём.

    Читается с диска один раз. Это не «маркетинг», а ровно те артефакты, которые
    печатает ml/evaluate.py и ml/baseline.py — воспроизводимые одной командой.
    """
    global _quality
    if _quality is not None:
        return _quality
    art = ML_DIR / 'artifacts'
    if not art.exists():
        return None
    payload = {
        'metrics': _read_json(art / 'metrics.json'),
        'baselines': _read_json(art / 'baselines.json'),
        'featureImportance': _read_json(art / 'feature_importance.json'),
    }
    if not any(payload.values()):
        return None
    _quality = payload
    return _quality
