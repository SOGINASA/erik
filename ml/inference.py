"""Инференс: предскажет, придёт ли волонтёр на следующий сбор.

Даёт и удобную функцию/класс для бэкенда, и CLI для ручной проверки.

Пример из кода (так это вызовет Flask-роут):

    from inference import AttendancePredictor

    predictor = AttendancePredictor()          # грузит модель один раз
    result = predictor.predict(
        history={
            "came": 7, "total": 10,            # приходил 7 из 10 (пропустил 3)
            "theme_came": 3, "theme_total": 3, # по этой теме приходил всегда
            "interests": ["eco", "trees"],
            "recent_came_rate": 0.8,
            "days_since_last": 12,
        },
        event={"event_type": "eco", "answer": "yes"},
    )
    # → {"will_attend": True, "probability": 0.87, "label": "придёт", ...}

Пример из терминала:

    python inference.py --came 7 --total 10 --event-type eco --answer yes \\
                        --interests eco,trees --theme-came 3 --theme-total 3
    python inference.py --demo          # несколько показательных примеров
"""
import argparse
import json

import joblib

from config import MODEL_PATH, METRICS_PATH, EVENT_TYPES, ANSWERS
from features import features_from_history


class AttendancePredictor:
    """Обёртка над сохранённым пайплайном. Грузит модель один раз."""

    def __init__(self, model_path=MODEL_PATH, threshold=None):
        if not model_path.exists():
            raise FileNotFoundError(
                f"Модель не найдена: {model_path}. Сначала обучите: python train.py"
            )
        bundle = joblib.load(model_path)
        self.pipeline = bundle["pipeline"]
        self.model_name = bundle.get("model_name", "unknown")
        # порог: явный → из metrics.json → 0.5
        self.threshold = threshold if threshold is not None else self._load_threshold()

    @staticmethod
    def _load_threshold(default=0.5):
        if METRICS_PATH.exists():
            try:
                with open(METRICS_PATH, encoding="utf-8") as f:
                    return float(json.load(f).get("threshold", default))
            except Exception:
                pass
        return default

    def predict(self, history: dict, event: dict) -> dict:
        """Предсказать явку для одного (волонтёр, сбор).

        history / event — см. features.features_from_history.
        Возвращает словарь с вероятностью, бинарным решением и человекочитаемой меткой.
        """
        X = features_from_history(history, event)
        proba = float(self.pipeline.predict_proba(X)[0, 1])
        will = proba >= self.threshold
        return {
            "will_attend": bool(will),
            "probability": round(proba, 4),
            "label": "придёт" if will else "не придёт",
            "confidence": _confidence_band(proba),
            "threshold": self.threshold,
            "event_type": event.get("event_type"),
            "event_type_label": EVENT_TYPES.get(event.get("event_type"), event.get("event_type")),
            "answer": event.get("answer"),
            "model": self.model_name,
        }

    def predict_batch(self, items: list[tuple[dict, dict]]) -> list[dict]:
        """Пакетное предсказание для списка (history, event)."""
        return [self.predict(h, e) for h, e in items]


def _confidence_band(p: float) -> str:
    """Грубая словесная уверенность — для UI координатора."""
    d = abs(p - 0.5)
    if d >= 0.35:
        return "высокая"
    if d >= 0.15:
        return "средняя"
    return "низкая"


# кэш для функционального стиля
_PREDICTOR: AttendancePredictor | None = None


def predict_one(history: dict, event: dict) -> dict:
    """Функциональный доступ: грузит модель лениво и переиспользует её."""
    global _PREDICTOR
    if _PREDICTOR is None:
        _PREDICTOR = AttendancePredictor()
    return _PREDICTOR.predict(history, event)


# ─────────────────────────────────────────────────────────────────────────────
#  CLI
# ─────────────────────────────────────────────────────────────────────────────
def _demo(predictor: AttendancePredictor):
    cases = [
        ("Надёжный, тема из интересов, ответил «да»",
         {"came": 9, "total": 10, "theme_came": 4, "theme_total": 4,
          "interests": ["eco", "trees"], "recent_came_rate": 0.9, "days_since_last": 10},
         {"event_type": "eco", "answer": "yes"}),
        ("Флаки-волонтёр, чужая тема, ответил «может быть»",
         {"came": 2, "total": 9, "theme_came": 0, "theme_total": 2,
          "interests": ["sport"], "recent_came_rate": 0.2, "days_since_last": 40},
         {"event_type": "blood", "answer": "maybe"}),
        ("Новичок без истории, тема из интересов, «да»",
         {"came": 0, "total": 0, "interests": ["edu"]},
         {"event_type": "edu", "answer": "yes"}),
        ("Средний волонтёр, ответил «нет»",
         {"came": 5, "total": 10, "interests": ["animals"]},
         {"event_type": "animals", "answer": "no"}),
    ]
    print("\n── Демо-предсказания ──")
    for title, hist, ev in cases:
        r = predictor.predict(hist, ev)
        et = r["event_type_label"]
        print(f"\n• {title}")
        print(f"  сбор: {et} / ответ: {r['answer']}")
        print(f"  → {r['label'].upper():9s} p={r['probability']:.3f} "
              f"(уверенность: {r['confidence']})")


def main():
    ap = argparse.ArgumentParser(description="Предсказать явку волонтёра на сбор.")
    ap.add_argument("--demo", action="store_true", help="показать демо-примеры")
    ap.add_argument("--json", type=str, help='JSON вида {"history":{...},"event":{...}}')

    # плоские флаги — для быстрой ручной проверки
    ap.add_argument("--came", type=int, default=0, help="сколько раз приходил")
    ap.add_argument("--total", type=int, help="сколько сборов было (came+missed)")
    ap.add_argument("--missed", type=int, default=0, help="сколько пропустил (если нет --total)")
    ap.add_argument("--theme-came", type=int, default=0)
    ap.add_argument("--theme-total", type=int, default=0)
    ap.add_argument("--recent-came-rate", type=float, default=None)
    ap.add_argument("--days-since-last", type=float, default=None)
    ap.add_argument("--interests", type=str, default="", help="через запятую: eco,edu")
    ap.add_argument("--event-type", type=str, default="eco", choices=list(EVENT_TYPES))
    ap.add_argument("--answer", type=str, default="yes", choices=list(ANSWERS))
    ap.add_argument("--threshold", type=float, default=None)
    args = ap.parse_args()

    predictor = AttendancePredictor(threshold=args.threshold)

    if args.demo:
        _demo(predictor)
        return

    if args.json:
        payload = json.loads(args.json)
        r = predictor.predict(payload["history"], payload["event"])
        print(json.dumps(r, ensure_ascii=False, indent=2))
        return

    history = {
        "came": args.came,
        "missed": args.missed,
        "theme_came": args.theme_came,
        "theme_total": args.theme_total,
        "interests": [s for s in args.interests.split(",") if s],
    }
    if args.total is not None:
        history["total"] = args.total
    if args.recent_came_rate is not None:
        history["recent_came_rate"] = args.recent_came_rate
    if args.days_since_last is not None:
        history["days_since_last"] = args.days_since_last

    event = {"event_type": args.event_type, "answer": args.answer}
    r = predictor.predict(history, event)
    print(json.dumps(r, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
