# Контекст сборки — КОРЕНЬ репозитория (см. docker-compose.yml), а не backend/:
# в образ должен попасть и каталог ml/ с обученным артефактом модели. Пока
# контекст был backend/, ml/ физически отсутствовал в сборке, мост отдавал
# no_ml_dir, и прогноз в проде всегда считался формулой — при том что продукт
# заявляет ML-модель.
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# libgomp1 нужен HistGradientBoostingClassifier в рантайме (OpenMP), curl — healthcheck.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libgomp1 curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY backend/requirements.txt backend/requirements-ml.txt ./

# requirements-ml.txt — numpy/pandas/scikit-learn/joblib. Без них мост отдаёт
# deps_missing, и прогноз молча уезжает на формулу.
RUN pip install --no-cache-dir -r requirements.txt -r requirements-ml.txt gunicorn

COPY backend/ /app/
# Модель и её признаки. Артефакты (attendance_model.joblib, metrics.json,
# baselines.json, feature_importance.json) закоммичены — переобучение на сервере
# не нужно.
COPY ml/ /ml/

# ml/config.py на импорте создаёт artifacts/ и data/ — каталог должен быть записываемым.
RUN mkdir -p /ml/data && chmod -R 777 /ml/data

# Путь к ml/ задаём явно: в образе backend лежит в /app, а ml — в /ml, поэтому
# «сосед по родителю» из attendance_ml.py здесь не сработал бы.
ENV ERIK_ML_DIR=/ml
# Прогрев модели при старте воркера (иначе первый запрос платит распаковку joblib).
ENV ERIK_ML_WARMUP=1

# Папка для БД с правами на запись
RUN mkdir -p /app/database && chmod 777 /app/database

COPY backend/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 6752

CMD ["/entrypoint.sh"]
