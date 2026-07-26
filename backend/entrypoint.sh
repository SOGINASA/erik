#!/bin/sh
set -e

# Схему поднимают МИГРАЦИИ, а не db.create_all(). create_all() добавляет недостающие
# таблицы, но не колонки в существующие: на томе с БД от прошлой версии это давало
# наполовину обновлённую схему (новая таблица есть, новой колонки нет) и 500 на любом
# запросе к users — снаружи выглядело как «сломалась вся система юзеров».
# SKIP_DB_CREATE=1 обязателен: иначе create_all() успевает создать новые таблицы до
# миграции, и её create_table падает на «table already exists».
export SKIP_DB_CREATE=1
export FLASK_APP=app.py

echo "[entrypoint] db-sync: приводим схему к head..."
flask db-sync

echo "[entrypoint] Starting gunicorn..."
exec gunicorn --preload -w 4 --threads 10 -b 0.0.0.0:6752 --timeout 120 \
  --access-logfile - --error-logfile - --log-level info --capture-output \
  app:app
