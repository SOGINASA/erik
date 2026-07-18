#!/bin/sh
set -e

echo "[entrypoint] Starting gunicorn..."
exec gunicorn --preload -w 4 --threads 10 -b 0.0.0.0:5000 --timeout 120 app:app
