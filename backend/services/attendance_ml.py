"""Мост к ML-модели прогноза явки (ml/inference.py).

ML-модуль лежит рядом с backend/ (см. ../ml). Он самостоятельный: у него свои
top-level модули `config`/`features`, имена которых пересекаются с backend/config.py.
Поэтому импортируем его ИЗОЛИРОВАННО (подменяя записи в sys.modules только на время
импорта) — чтобы ml-`config` не перезаписал backend-`config` и наоборот.

Мост мягко деградирует: если ml/ нет, зависимости не установлены или модель ещё не
обучена (артефакт в ml/artifacts/ — в .gitignore, его может не быть), API отдаёт
{'available': False, 'reason': ...} с подсказкой, а бэкенд НЕ падает.

Маппинг входа — как в ml/README.md («Как это ложится на бэкенд»):
    history.came      ← User.trust_came   (для гостя — snapshot hist_came_at_rsvp)
    history.total     ← User.trust_total  (для гостя — snapshot hist_total_at_rsvp)
    history.interests ← User.skills       (временный маппинг; справочник тем-интересов позже)
    event.event_type  ← Gathering.theme   (у сборов координатора её может не быть → '')
    event.answer      ← Participant.answer
"""
import importlib.util
import sys
from pathlib import Path

# ml/ — сосед backend/: .../backend/services/attendance_ml.py → parents[2] = корень репо
ML_DIR = Path(__file__).resolve().parents[2] / 'ml'

# ml/inference.py делает `from config import ...` / `from features import ...` — их и
# изолируем. Порядок важен: config → features → inference (кросс-импорты между ними).
_ML_MODULES = ('config', 'features', 'inference')

# Подсказки для каждого нерабочего состояния — уходят во фронт как поле hint.
_HINTS = {
    'no_ml_dir': 'Каталог ml/ не найден рядом с backend/',
    'deps_missing': 'Установите зависимости ML: pip install -r ml/requirements.txt',
    'model_not_trained': 'Обучите модель: cd ml && python train.py',
    'error': 'Не удалось загрузить ML-модель — см. логи сервера',
}

# Ленивое одноразовое состояние моста.
_predictor = None      # inference.AttendancePredictor | None
_status = None         # 'ok' | ключ из _HINTS
_loaded = False        # была ли уже попытка загрузки


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
    global _predictor, _status, _loaded
    _predictor = None
    _status = None
    _loaded = False


def is_available():
    _load()
    return _predictor is not None


def _history_from_participant(part):
    """Агрегаты истории для модели. Привязан к User — живой trust_*, иначе snapshot RSVP."""
    if part.user_id and part.user is not None:
        u = part.user
        return {
            'came': u.trust_came or 0,
            'total': u.trust_total or 0,
            'interests': u.skills or [],
        }
    return {
        'came': part.hist_came_at_rsvp or 0,
        'total': part.hist_total_at_rsvp or 0,
        'interests': [],
    }


def predict_participant(part, event_type):
    """Предсказание явки для одного участника или None (нет ответа / модель молчит)."""
    if not is_available() or part.answer not in ('yes', 'maybe', 'no'):
        return None
    try:
        return _predictor.predict(
            _history_from_participant(part),
            {'event_type': event_type or '', 'answer': part.answer},
        )
    except Exception:
        return None


def forecast_gathering(gathering):
    """ML-прогноз по сбору: вероятность явки на каждого + агрегат.

    `expected` — сумма вероятностей ответивших (не 'no'): ML-оценка ожидаемой явки,
    компаньон аналитического E из services/forecast.py. При недоступной модели —
    {'available': False, 'reason', 'hint'} (бэкенд не падает)."""
    if not is_available():
        return {'available': False, 'reason': _status, 'hint': _HINTS.get(_status)}

    people = []
    expected = 0.0
    for part in gathering.participants:
        pred = predict_participant(part, gathering.theme)
        if pred is None:
            continue
        expected += pred['probability']
        people.append({
            'id': part.id,
            'name': part.name,
            'answer': part.answer,
            'probability': pred['probability'],
            'willAttend': pred['will_attend'],
            'confidence': pred['confidence'],
        })

    return {
        'available': True,
        'model': _predictor.model_name,
        'threshold': _predictor.threshold,
        'expected': round(expected, 1),
        'needed': gathering.needed,
        'participants': people,
    }
