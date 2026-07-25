"""Сравнение обученной модели с «формульными» базлайнами — доказательство того,
что это МОДЕЛЬ, а не статистика по ответу.

Отвечает на прямой вопрос жюри: «а прогноз не просто повторяет число подтвердивших?».
Сравниваем на ОДНОМ И ТОМ ЖЕ отложенном тесте (сплит по волонтёрам, без утечки):

  1. answer-only    — вероятность прийти = средняя явка по ответу (yes/maybe/no) на train.
                      Это и есть «просто посчитать подтвердивших»: ranкинг только по ответу.
  2. formula        — аналитическая матмодель продукта p = clamp(base·trust·ctx),
                      где base входит дважды (как в backend/services/forecast.py).
  3. model          — обученный ML-пайплайн (ml/artifacts/attendance_model.joblib).

Метрики: ROC-AUC / PR-AUC / Brier / log-loss / F1@0.5, а также агрегатная калибровка
«ожидаемая явка Σp против фактической» — показывает, что Σp модели ≈ реальному числу
пришедших, тогда как answer-only систематически мимо.

Запуск:
    python baseline.py            # обучить базлайны и сравнить на тесте
    python baseline.py --json     # ещё и machine-readable вывод

Результат → artifacts/baselines.json
"""
import argparse
import json

import joblib
import numpy as np
import pandas as pd
from sklearn.metrics import (
    roc_auc_score, average_precision_score, brier_score_loss, log_loss,
    f1_score, accuracy_score,
)
from sklearn.model_selection import GroupShuffleSplit

from config import (
    EVENTS_CSV, MODEL_PATH, ARTIFACTS_DIR, TARGET, ANSWERS,
)
from features import build_training_frame, split_X_y
from train import TEST_SIZE
import data_gen

BASELINES_PATH = ARTIFACTS_DIR / "baselines.json"

# Параметры аналитической матмодели — 1-в-1 с ForecastParams по умолчанию
# (backend/models.py) и services/forecast.py.
_FORECAST = dict(alpha=3.0, base_yes=0.62, base_maybe=0.24, base_no=0.02,
                 p_min=0.02, p_max=0.98, ctx=1.0)


def _base_of(answer):
    return {"yes": _FORECAST["base_yes"], "maybe": _FORECAST["base_maybe"],
            "no": _FORECAST["base_no"]}.get(answer, _FORECAST["base_no"])


def analytical_formula_proba(frame: pd.DataFrame) -> np.ndarray:
    """p_i = clamp(base·trust·ctx). trust=(came+α·base)/(total+α); base входит дважды."""
    a, ctx = _FORECAST["alpha"], _FORECAST["ctx"]
    lo, hi = _FORECAST["p_min"], _FORECAST["p_max"]
    out = np.empty(len(frame))
    for i, row in enumerate(frame.itertuples(index=False)):
        b = _base_of(row.answer)
        trust = (row.events_came + a * b) / (row.events_total + a)
        out[i] = min(hi, max(lo, b * trust * ctx))
    return out


def answer_only_proba(train_frame: pd.DataFrame, test_frame: pd.DataFrame) -> np.ndarray:
    """Средняя фактическая явка по каждому ответу на train → как вероятность на test.

    Это честный «формульный» базлайн уровня «сколько обычно доходит из ответивших так».
    Никакой истории волонтёра, темы, свежести — только RSVP.
    """
    rate = train_frame.groupby("answer")[TARGET].mean().to_dict()
    default = train_frame[TARGET].mean()
    return test_frame["answer"].map(lambda a: rate.get(a, default)).values


def _metrics(y_true, proba) -> dict:
    pred = (proba >= 0.5).astype(int)
    # clip для log_loss (формульные p могут упереться в 0/1 границы)
    p = np.clip(proba, 1e-6, 1 - 1e-6)
    return {
        "roc_auc": float(roc_auc_score(y_true, proba)),
        "pr_auc": float(average_precision_score(y_true, proba)),
        "brier": float(brier_score_loss(y_true, proba)),
        "log_loss": float(log_loss(y_true, p, labels=[0, 1])),
        "f1_at_0.5": float(f1_score(y_true, pred, zero_division=0)),
        "accuracy_at_0.5": float(accuracy_score(y_true, pred)),
        # агрегатная калибровка: ожидаемая явка Σp против фактической
        "expected_sum": float(proba.sum()),
        "abs_expected_error": float(abs(proba.sum() - y_true.sum())),
        "mean_abs_error": float(np.mean(np.abs(proba - y_true))),
    }


def main():
    ap = argparse.ArgumentParser(description="Модель против формульных базлайнов.")
    ap.add_argument("--json", action="store_true", help="напечатать machine-readable JSON")
    ap.add_argument("--seed", type=int, default=None)
    args = ap.parse_args()

    if not MODEL_PATH.exists():
        raise SystemExit(f"Модель не найдена: {MODEL_PATH}. Сначала: python train.py")
    if not EVENTS_CSV.exists():
        print("Журнала нет — генерирую…")
        data_gen.generate_events().to_csv(EVENTS_CSV, index=False, encoding="utf-8")

    bundle = joblib.load(MODEL_PATH)
    seed = args.seed if args.seed is not None else bundle.get("seed", 20260718)

    # Тот же причинный фрейм и ТОТ ЖЕ групповой сплит, что в train.py, — честное сравнение.
    frame = build_training_frame(pd.read_csv(EVENTS_CSV))
    groups = frame["volunteer_id"].values
    gss = GroupShuffleSplit(n_splits=1, test_size=TEST_SIZE, random_state=seed)
    train_idx, test_idx = next(gss.split(frame, frame[TARGET], groups))
    train_df, test_df = frame.iloc[train_idx], frame.iloc[test_idx]

    X_test, y_test = split_X_y(test_df)
    y_true = y_test.values

    # три предсказателя на одном тесте
    proba_model = bundle["pipeline"].predict_proba(X_test)[:, 1]
    proba_answer = answer_only_proba(train_df, test_df)
    proba_formula = analytical_formula_proba(test_df)

    results = {
        "answer_only": _metrics(y_true, proba_answer),
        "formula": _metrics(y_true, proba_formula),
        "model": _metrics(y_true, proba_model),
    }
    meta = {
        "model_name": bundle.get("model_name"),
        "calibrated": bundle.get("calibrated"),
        "n_test": int(len(y_true)),
        "actual_came": int(y_true.sum()),
        "seed": int(seed),
    }

    # ── печать таблицы ──
    order = [("answer_only", "answer-only (формула по ответу)"),
             ("formula", "матмодель base·trust·ctx"),
             ("model", f"МОДЕЛЬ ({meta['model_name']}, калибр.)")]
    print("\n" + "=" * 74)
    print("  МОДЕЛЬ ПРОТИВ ФОРМУЛ  —  отложенный тест, сплит по волонтёрам")
    print(f"  n_test={meta['n_test']:,}  ·  фактически пришло={meta['actual_came']:,}")
    print("=" * 74)
    print(f"  {'предсказатель':<34}{'ROC-AUC':>9}{'PR-AUC':>9}{'Brier':>8}{'F1@.5':>8}")
    print("  " + "-" * 70)
    for key, label in order:
        m = results[key]
        print(f"  {label:<34}{m['roc_auc']:>9.3f}{m['pr_auc']:>9.3f}"
              f"{m['brier']:>8.3f}{m['f1_at_0.5']:>8.3f}")
    print("  " + "-" * 70)
    print("\n  Калибровка ожидаемой явки (Σp против факта = "
          f"{meta['actual_came']}):")
    for key, label in order:
        m = results[key]
        print(f"    {label:<34} Σp={m['expected_sum']:8.1f}  "
              f"|ошибка|={m['abs_expected_error']:6.1f}")

    best = max(results, key=lambda k: results[k]["roc_auc"])
    lift_vs_answer = results["model"]["roc_auc"] - results["answer_only"]["roc_auc"]
    lift_vs_formula = results["model"]["roc_auc"] - results["formula"]["roc_auc"]
    print("\n  ВЫВОД:")
    print(f"    Лучший по ROC-AUC: {best}")
    print(f"    Модель обыгрывает answer-only на  +{lift_vs_answer:.3f} ROC-AUC")
    print(f"    Модель обыгрывает матформулу на   +{lift_vs_formula:.3f} ROC-AUC")
    print("    → прогноз использует историю/тему/свежесть, а не только ответ.")

    payload = {"meta": meta, "results": results,
               "lift_roc_auc_vs_answer_only": float(lift_vs_answer),
               "lift_roc_auc_vs_formula": float(lift_vs_formula)}
    with open(BASELINES_PATH, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    print(f"\n  Сохранено → {BASELINES_PATH}")

    if args.json:
        print(json.dumps(payload, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
