"""Оценка обученной модели: полный набор метрик + графики.

Считает на отложенном тесте (data/test_set.csv, сохранён train.py):
  • Accuracy;
  • Precision / Recall / F1 — по классам и усреднённые (macro / weighted);
  • ROC-AUC и PR-AUC (average precision) — качество ранжирования вероятностей;
  • Log-loss и Brier score — калибровка вероятностей;
  • матрица ошибок (confusion matrix) + отчёт classification_report;
  • подбор оптимального порога по F1 (полезно: класс слегка несбалансирован).

Сохраняет artifacts/metrics.json и, если есть matplotlib,
графики confusion_matrix.png и roc_curve.png.

Запуск:
    python evaluate.py                 # метрики на отложенном тесте
    python evaluate.py --threshold 0.4 # с заданным порогом отсечения
"""
import argparse
import json

import joblib
import numpy as np
import pandas as pd
from sklearn.metrics import (
    accuracy_score, precision_score, recall_score, f1_score,
    roc_auc_score, average_precision_score, log_loss, brier_score_loss,
    confusion_matrix, classification_report, roc_curve,
)

from config import (
    MODEL_PATH, METRICS_PATH, CONFUSION_PLOT_PATH, ROC_PLOT_PATH, TARGET,
)
from features import split_X_y
from train import TEST_SET_PATH


def best_threshold_by_macro_f1(y_true, proba):
    """Порог, максимизирующий macro-F1 (баланс обоих классов «придёт»/«не придёт»).

    Класс несбалансирован, и продукту важно ловить не только тех, кто придёт,
    но и вероятных «не-пришедших» — поэтому оптимизируем усреднённый F1, а не
    только положительный. Возвращает (порог, macro_f1).
    """
    best_thr, best_f1 = 0.5, -1.0
    for thr in np.linspace(0.05, 0.95, 91):
        pred = (proba >= thr).astype(int)
        f1m = f1_score(y_true, pred, average="macro", zero_division=0)
        if f1m > best_f1:
            best_f1, best_thr = f1m, float(thr)
    return best_thr, best_f1


def compute_metrics(y_true, proba, threshold=0.5) -> dict:
    """Собрать все метрики в один словарь."""
    pred = (proba >= threshold).astype(int)
    tn, fp, fn, tp = confusion_matrix(y_true, pred, labels=[0, 1]).ravel()

    return {
        "threshold": float(threshold),
        "accuracy": float(accuracy_score(y_true, pred)),
        # класс 1 = «придёт» — основной для продукта
        "precision_pos": float(precision_score(y_true, pred, pos_label=1, zero_division=0)),
        "recall_pos": float(recall_score(y_true, pred, pos_label=1, zero_division=0)),
        "f1_pos": float(f1_score(y_true, pred, pos_label=1, zero_division=0)),
        # класс 0 = «не придёт»
        "precision_neg": float(precision_score(y_true, pred, pos_label=0, zero_division=0)),
        "recall_neg": float(recall_score(y_true, pred, pos_label=0, zero_division=0)),
        "f1_neg": float(f1_score(y_true, pred, pos_label=0, zero_division=0)),
        # усреднённые
        "f1_macro": float(f1_score(y_true, pred, average="macro", zero_division=0)),
        "f1_weighted": float(f1_score(y_true, pred, average="weighted", zero_division=0)),
        "precision_macro": float(precision_score(y_true, pred, average="macro", zero_division=0)),
        "recall_macro": float(recall_score(y_true, pred, average="macro", zero_division=0)),
        # ранжирование вероятностей (не зависит от порога)
        "roc_auc": float(roc_auc_score(y_true, proba)),
        "pr_auc": float(average_precision_score(y_true, proba)),
        # калибровка
        "log_loss": float(log_loss(y_true, proba, labels=[0, 1])),
        "brier": float(brier_score_loss(y_true, proba)),
        # матрица ошибок
        "confusion_matrix": {"tn": int(tn), "fp": int(fp), "fn": int(fn), "tp": int(tp)},
        "support": {"pos": int(np.sum(y_true == 1)), "neg": int(np.sum(y_true == 0))},
    }


def _print_report(m, y_true, pred):
    print("\n" + "=" * 56)
    print("  МЕТРИКИ МОДЕЛИ ПРОГНОЗА ЯВКИ  (класс 1 = «придёт»)")
    print("=" * 56)
    print(f"  Порог отсечения        : {m['threshold']:.3f}")
    print(f"  Accuracy               : {m['accuracy']:.3f}")
    print("  ─ класс «придёт» (1) ─")
    print(f"    Precision            : {m['precision_pos']:.3f}")
    print(f"    Recall               : {m['recall_pos']:.3f}")
    print(f"    F1                   : {m['f1_pos']:.3f}")
    print("  ─ усреднённо ─")
    print(f"    F1 macro             : {m['f1_macro']:.3f}")
    print(f"    F1 weighted          : {m['f1_weighted']:.3f}")
    print("  ─ ранжирование / калибровка ─")
    print(f"    ROC-AUC              : {m['roc_auc']:.3f}")
    print(f"    PR-AUC (avg prec.)   : {m['pr_auc']:.3f}")
    print(f"    Log-loss             : {m['log_loss']:.3f}")
    print(f"    Brier score          : {m['brier']:.3f}")
    cm = m["confusion_matrix"]
    print("  ─ матрица ошибок ─")
    print(f"                 pred: не придёт | придёт")
    print(f"    факт не придёт :   {cm['tn']:6d}    | {cm['fp']:6d}")
    print(f"    факт придёт    :   {cm['fn']:6d}    | {cm['tp']:6d}")
    print("\n  classification_report:")
    print(classification_report(y_true, pred, target_names=["не придёт", "придёт"],
                                digits=3, zero_division=0))


def _save_plots(y_true, proba, pred):
    """Сохранить графики, если matplotlib установлен (иначе тихо пропустить)."""
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
    except Exception:
        print("(matplotlib не установлен — графики пропущены)")
        return

    # confusion matrix
    cm = confusion_matrix(y_true, pred, labels=[0, 1])
    fig, ax = plt.subplots(figsize=(4.2, 3.8))
    im = ax.imshow(cm, cmap="Greens")
    ax.set_xticks([0, 1], ["не придёт", "придёт"])
    ax.set_yticks([0, 1], ["не придёт", "придёт"])
    ax.set_xlabel("Прогноз")
    ax.set_ylabel("Факт")
    ax.set_title("Матрица ошибок")
    for i in range(2):
        for j in range(2):
            ax.text(j, i, cm[i, j], ha="center", va="center",
                    color="white" if cm[i, j] > cm.max() / 2 else "black")
    fig.colorbar(im, fraction=0.046, pad=0.04)
    fig.tight_layout()
    fig.savefig(CONFUSION_PLOT_PATH, dpi=120)
    plt.close(fig)

    # ROC curve
    fpr, tpr, _ = roc_curve(y_true, proba)
    auc = roc_auc_score(y_true, proba)
    fig, ax = plt.subplots(figsize=(4.4, 4.0))
    ax.plot(fpr, tpr, label=f"ROC (AUC={auc:.3f})", color="#2F6F4F")
    ax.plot([0, 1], [0, 1], "--", color="gray", linewidth=1)
    ax.set_xlabel("False Positive Rate")
    ax.set_ylabel("True Positive Rate")
    ax.set_title("ROC-кривая")
    ax.legend(loc="lower right")
    fig.tight_layout()
    fig.savefig(ROC_PLOT_PATH, dpi=120)
    plt.close(fig)

    print(f"Графики: {CONFUSION_PLOT_PATH.name}, {ROC_PLOT_PATH.name} → {CONFUSION_PLOT_PATH.parent}")


def main():
    ap = argparse.ArgumentParser(description="Полные метрики модели прогноза явки.")
    ap.add_argument("--threshold", type=float, default=None,
                    help="порог отсечения (по умолчанию — оптимальный по F1)")
    ap.add_argument("--no-plots", action="store_true", help="не строить графики")
    args = ap.parse_args()

    if not MODEL_PATH.exists():
        raise SystemExit(f"Модель не найдена: {MODEL_PATH}. Сначала: python train.py")
    if not TEST_SET_PATH.exists():
        raise SystemExit(f"Тест не найден: {TEST_SET_PATH}. Сначала: python train.py")

    bundle = joblib.load(MODEL_PATH)
    pipe = bundle["pipeline"]
    test_df = pd.read_csv(TEST_SET_PATH)
    X_test, y_test = split_X_y(test_df)
    y_true = y_test.values

    proba = pipe.predict_proba(X_test)[:, 1]

    # порог: заданный или оптимальный по macro-F1 (баланс обоих классов)
    if args.threshold is not None:
        threshold = args.threshold
    else:
        threshold, best_f1 = best_threshold_by_macro_f1(y_true, proba)
        print(f"Оптимальный порог по macro-F1: {threshold:.3f} (macro-F1={best_f1:.3f})")

    metrics = compute_metrics(y_true, proba, threshold)
    metrics["model_name"] = bundle.get("model_name")
    metrics["n_test"] = int(len(y_true))

    pred = (proba >= threshold).astype(int)
    _print_report(metrics, y_true, pred)

    # метрики и на пороге 0.5 — для сравнения
    metrics["at_threshold_0.5"] = compute_metrics(y_true, proba, 0.5)

    with open(METRICS_PATH, "w", encoding="utf-8") as f:
        json.dump(metrics, f, ensure_ascii=False, indent=2)
    print(f"\nМетрики сохранены → {METRICS_PATH}")

    if not args.no_plots:
        _save_plots(y_true, proba, pred)


if __name__ == "__main__":
    main()
