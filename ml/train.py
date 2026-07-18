"""Обучение модели прогноза явки волонтёра на следующий сбор.

Пайплайн:
  1. загрузить (или сгенерировать) синтетический журнал явки;
  2. собрать причинную матрицу признаков (features.build_training_frame);
  3. разбить по ВОЛОНТЁРАМ (GroupShuffleSplit) — чтобы история одного человека
     не оказалась сразу в train и test (иначе утечка и завышенные метрики);
  4. обучить пайплайн (preprocessing + классификатор);
  5. сохранить модель и отложенный тест для evaluate.py.

Запуск:
    python train.py                     # модель по умолчанию (градиентный бустинг)
    python train.py --model logreg      # логистическая регрессия (базлайн)
    python train.py --model forest      # случайный лес
    python train.py --regenerate        # перегенерировать данные заново
"""
import argparse
import json

import joblib
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import HistGradientBoostingClassifier, RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, f1_score, roc_auc_score
from sklearn.model_selection import GroupShuffleSplit, cross_val_score
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

from config import (
    NUMERIC_FEATURES, CATEGORICAL_FEATURES, TARGET,
    EVENTS_CSV, FEATURES_CSV, MODEL_PATH, DATA_DIR, RANDOM_SEED,
)
from features import build_training_frame, split_X_y
import data_gen

TEST_SET_PATH = DATA_DIR / "test_set.csv"
TEST_SIZE = 0.2


# ─────────────────────────────────────────────────────────────────────────────
#  Пайплайн: предобработка + модель
# ─────────────────────────────────────────────────────────────────────────────
def build_pipeline(model_name: str) -> Pipeline:
    """Собрать sklearn-пайплайн под выбранный классификатор.

    Категориальные признаки → one-hot. Числовые → масштабирование только там,
    где это важно (логрегрессия); деревьям масштаб не нужен.
    """
    onehot = OneHotEncoder(handle_unknown="ignore", sparse_output=False)

    if model_name == "logreg":
        numeric = StandardScaler()
        clf = LogisticRegression(max_iter=2000, C=1.0, class_weight="balanced")
    elif model_name == "forest":
        numeric = "passthrough"
        clf = RandomForestClassifier(
            n_estimators=400, max_depth=None, min_samples_leaf=5,
            n_jobs=-1, class_weight="balanced", random_state=RANDOM_SEED,
        )
    elif model_name == "gboost":
        numeric = "passthrough"
        clf = HistGradientBoostingClassifier(
            max_iter=400, learning_rate=0.06, max_leaf_nodes=31,
            l2_regularization=1.0, early_stopping=True, validation_fraction=0.1,
            random_state=RANDOM_SEED,
        )
    else:
        raise ValueError(f"Неизвестная модель: {model_name!r} (logreg | forest | gboost)")

    pre = ColumnTransformer(
        transformers=[
            ("num", numeric, NUMERIC_FEATURES),
            ("cat", onehot, CATEGORICAL_FEATURES),
        ]
    )
    return Pipeline([("pre", pre), ("clf", clf)])


# ─────────────────────────────────────────────────────────────────────────────
#  Данные
# ─────────────────────────────────────────────────────────────────────────────
def load_or_make_events(regenerate: bool) -> pd.DataFrame:
    if regenerate or not EVENTS_CSV.exists():
        print("Генерирую синтетический журнал явки…")
        df = data_gen.generate_events()
        df.to_csv(EVENTS_CSV, index=False, encoding="utf-8")
    else:
        df = pd.read_csv(EVENTS_CSV)
        print(f"Загружен журнал: {EVENTS_CSV}")
    return df


def main():
    ap = argparse.ArgumentParser(description="Обучить модель прогноза явки.")
    ap.add_argument("--model", choices=["gboost", "forest", "logreg"], default="gboost")
    ap.add_argument("--regenerate", action="store_true", help="перегенерировать данные")
    ap.add_argument("--seed", type=int, default=RANDOM_SEED)
    args = ap.parse_args()

    # 1) данные → 2) причинная матрица признаков
    events = load_or_make_events(args.regenerate)
    frame = build_training_frame(events)
    frame.to_csv(FEATURES_CSV, index=False, encoding="utf-8")
    print(f"Матрица признаков: {len(frame):,} строк, {len(NUMERIC_FEATURES)+len(CATEGORICAL_FEATURES)} признаков")
    print(f"Баланс классов (доля 'придёт'): {frame[TARGET].mean():.3f}")

    # 3) сплит ПО ВОЛОНТЁРАМ — без утечки истории между train и test
    groups = frame["volunteer_id"].values
    gss = GroupShuffleSplit(n_splits=1, test_size=TEST_SIZE, random_state=args.seed)
    train_idx, test_idx = next(gss.split(frame, frame[TARGET], groups))
    train_df, test_df = frame.iloc[train_idx], frame.iloc[test_idx]

    X_train, y_train = split_X_y(train_df)
    X_test, y_test = split_X_y(test_df)
    print(f"Train: {len(X_train):,} строк | Test: {len(X_test):,} строк "
          f"(волонтёры не пересекаются)")

    # 4) обучение
    pipe = build_pipeline(args.model)

    # честная кросс-валидация на train (тоже с группировкой по волонтёрам)
    cv_groups = train_df["volunteer_id"].values
    cv_splitter = GroupShuffleSplit(n_splits=5, test_size=0.2, random_state=args.seed)
    cv_f1 = cross_val_score(pipe, X_train, y_train, groups=cv_groups,
                            cv=cv_splitter, scoring="f1")
    print(f"\nМодель: {args.model}")
    print(f"CV F1 на train: {cv_f1.mean():.3f} ± {cv_f1.std():.3f}")

    pipe.fit(X_train, y_train)

    # быстрый контроль на отложенном тесте (подробности — в evaluate.py)
    proba = pipe.predict_proba(X_test)[:, 1]
    pred = (proba >= 0.5).astype(int)
    print("\n── Отложенный тест (порог 0.5) ──")
    print(f"Accuracy : {accuracy_score(y_test, pred):.3f}")
    print(f"F1       : {f1_score(y_test, pred):.3f}")
    print(f"ROC-AUC  : {roc_auc_score(y_test, proba):.3f}")

    # 5) сохранить модель + метаданные и отложенный тест
    bundle = {
        "pipeline": pipe,
        "model_name": args.model,
        "numeric_features": NUMERIC_FEATURES,
        "categorical_features": CATEGORICAL_FEATURES,
        "target": TARGET,
        "class_balance": float(frame[TARGET].mean()),
        "n_train": int(len(X_train)),
        "n_test": int(len(X_test)),
        "seed": args.seed,
    }
    joblib.dump(bundle, MODEL_PATH)
    test_df.to_csv(TEST_SET_PATH, index=False, encoding="utf-8")

    print(f"\nМодель сохранена → {MODEL_PATH}")
    print(f"Отложенный тест  → {TEST_SET_PATH}")
    print("Дальше: python evaluate.py  (полные метрики: F1, precision/recall, ROC-AUC, матрица ошибок)")


if __name__ == "__main__":
    main()
