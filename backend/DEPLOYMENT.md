# Production rollout after the security changes

This release changes authentication and the production database. Do not point a
fresh PostgreSQL instance at live traffic until the data import has been rehearsed.

## Changed contracts

- `deviceId` is an identifier, not a credential. Resuming an existing guest requires
  its access token. Accounts with passwords must use `/auth/login`.
- Upgrading a guest through `/auth/register` requires the guest's JWT in addition
  to `X-Device-Id`. Upgrading invalidates previous guest tokens.
- `/auth/refresh` returns both `access_token` and `refresh_token`. Each refresh
  token works once. Clients must save the replacement and serialize refresh calls.
- `/logout`, password change and password reset invalidate **all** user tokens.
  Access tokens expire after 15 minutes; refresh tokens after 30 days.
- Old JWTs without the `ver` claim are rejected. Existing account users must sign
  in again. Existing passwordless guests cannot recover their history by device ID;
  arrange account upgrades before rollout or a separately verified support flow.
- Web and iOS clients were updated. Deploy compatible clients together with the API.
- `/events` returns 50 items by default, at most 200, plus `total`. Use `limit` and
  `offset`. Web Feed has a load-more button; iOS fetches bounded pages for its store.

## Configuration

Copy `.env.example` to `.env` and set actual values. Never commit `.env`.

- `FLASK_ENV=production`
- `SECRET_KEY`, `JWT_SECRET_KEY`: independent random values of at least 32 characters.
  Generate each using `python -c "import secrets; print(secrets.token_urlsafe(48))"`.
- `POSTGRES_PASSWORD`: strong database password.
- `DATABASE_URL=postgresql+psycopg://erik:URL_ENCODED_PASSWORD@postgres:5432/erik`.
  The password must match `POSTGRES_PASSWORD`; URL-encode special characters.
- `CORS_ORIGINS`, `FRONTEND_URL`: actual HTTPS frontend origins/URL.
- `LEGAL_*` values populate the published operator information. Missing values
  do not block registration by default, preserving compatibility with older env files.
  Set `REQUIRE_LEGAL_CONFIGURATION=1` to require complete metadata before registration.
  Consent checkboxes and consent records remain enabled in both modes.
- SMTP is optional. Leave `MAIL_SERVER` empty to run without email. Registration
  and password login still work; email verification messages are not sent and
  password recovery returns `503 email_unavailable` without creating reset tokens.
  When enabling SMTP, set `MAIL_SERVER`, `MAIL_PORT`, `MAIL_USE_TLS`, credentials
  and `MAIL_FROM`. Production never logs undelivered messages or their tokens.
- Compose sets `REDIS_URL=redis://redis:6379/0`, disables demo login and seeding,
  and sets `SKIP_DB_CREATE=1`. Startup seeds reference catalogs only.
- Demo identities cannot log in or reuse old JWTs in production, even if a stale
  environment contains `ALLOW_DEMO_LOGIN=1`. Password administrator creation
  remains available through `flask create-admin`.
- For exactly one trusted reverse proxy, set `TRUSTED_PROXY_HOPS=1` and configure
  that proxy to overwrite forwarded headers. Default 0 trusts none. Do not expose
  the backend directly when trusting proxy headers.

Compose binds the API to host loopback. Terminate HTTPS at the reverse proxy.
PostgreSQL and Redis have no published host ports. Containers run the API as a
non-root user. `/api/health` checks the database and Redis without revealing errors.

## Compose project name and existing host migration

The Compose project is explicitly named `erik`. With Docker Compose v2, the
containers are `erik-backend-1`, `erik-postgres-1` and `erik-redis-1`, the built
API image is `erik-backend`, and the network is `erik_default`. Service DNS names
remain `postgres` and `redis`; existing connection URLs do not need changes.
Remove an old `COMPOSE_PROJECT_NAME=backend` setting or `-p backend` launch flag:
these override the name in the file. Other projects must use their own names.

For a fresh installation, run `docker compose up -d --build` from `backend/`.
For an existing host, changing the project name also changes the default volume
names. **Complete the following migration before starting the renamed stack**
to keep the existing PostgreSQL and Redis data:

1. Identify the three existing Erik containers with `docker ps -a`. Verify their
   Compose working-directory labels and mounts, rather than relying on generic
   container names. Inspect each relevant container with:
   `docker inspect --format '{{json .Config.Labels}} {{json .Mounts}}' CONTAINER_ID`.
   Record the volume names mounted at `/var/lib/postgresql/data` and `/data`.
2. Take a verified database backup. Create `backend/docker-compose.override.yml`
   on the host using the exact existing volume names (the names below are only
   examples; verify that these volumes actually belong to Erik):

   ```yaml
   volumes:
     postgres_data:
       external: true
       name: backend_postgres_data
     redis_data:
       external: true
       name: backend_redis_data
   ```

   Keep this host-specific file for subsequent deployments. Compose loads it
   automatically when run from `backend/` without `-f`. If deployment commands
   use `-f`, include both files explicitly. External volumes must already exist;
   a mistyped name fails instead of silently creating an empty database.
3. Run `docker compose config --quiet` from `backend/`. Stop only the three
   verified old Erik containers with `docker stop ID_API ID_POSTGRES ID_REDIS`.
   Do not run project-wide cleanup against the shared old `backend` project or
   delete volumes. Never run two PostgreSQL containers against the same volume.
4. Run `docker compose up -d --build`, then `docker compose ps` and
   `curl --fail http://127.0.0.1:6752/api/health`. Verify existing accounts/data.
   After verification, remove only the stopped old containers with
   `docker rm ID_API ID_POSTGRES ID_REDIS` (without `-v`).

The API still binds to `127.0.0.1:6752`. A second simultaneous Erik instance needs
both a different project name and a different host port, plus separate volumes.

## Rehearsal and cutover

1. Freeze writes to the old deployment and take a consistent SQLite backup using
   SQLite's backup API. Preserve the original database and old release for rollback.
2. Start only infrastructure: `docker compose up -d postgres redis`.
3. Build the API: `docker compose build backend`.
4. Create the target schema once:
   `docker compose run --rm --entrypoint flask backend db upgrade`.
5. Run `scripts/import_sqlite.py` against the offline backup, with `DATABASE_URL`
   pointing at the target. For example, mount the backup directory read-only into
   a one-off backend container and override its entrypoint with `python`.
   The importer refuses a nonempty target, preserves IDs, resets sequences, checks
   row counts and rolls back all inserted data on failure. It never edits SQLite.
   Foreign-key/length errors mean source data needs review; do not disable constraints.
6. For a fresh launch without imported data, run
   `docker compose run --rm --entrypoint flask backend seed-catalogs` instead of
   importing. This creates only cities, themes, badges and forecast defaults.
7. Review imported demo users and the seeded `admin@erik.kz` account. Disable demo
   identities or rotate/replace their credentials before exposing the service.
   The known seeded admin password is refused in production. Create a real admin
   with `flask create-admin`; its password is entered invisibly.
8. Start the API: `docker compose up -d backend`. Verify login, guest registration,
   email, refresh, logout, event registration, check-in and finalization.
9. Switch traffic only after the rehearsal succeeds. Rollback to the frozen SQLite
   copy is lossless only before new production writes; after that, reconcile changes.

For multiple API replicas, execute migrations as a single deployment job before
starting replicas, rather than letting several entrypoints migrate concurrently.
Use a separate migration role and restricted runtime database role for that setup.

## Verification

```text
python -m pip install -r requirements-dev.txt
python -m pytest tests -q
python -m pip_audit -r requirements.txt
```

The PostgreSQL concurrency test is opt-in: set `TEST_POSTGRES_URL` to a disposable
test database, then run `python -m pytest tests/test_postgres_concurrency.py -q`.
It creates and drops only a randomly named test schema and tests two concurrent
requests for one remaining role slot. SQLite tests cannot establish row-lock behavior.

Run `python scripts/load_read.py --base http://127.0.0.1:6752/api` against staging
with realistic data. It reports errors, throughput and p50/p95 latency. This read-only
smoke workload does not replace authenticated write/concurrency/load scenarios.

Test regular PostgreSQL backups by restoring them into a separate database and
checking record counts and critical workflows. Establish retention and, where
required, point-in-time recovery before production traffic.

## Performance boundaries and remaining work

Feed queries are bounded and indexed; trust calculations aggregate in SQL. Writes
to one gathering take a PostgreSQL row lock. Redis limits are shared across workers
and fail closed if Redis is unavailable. Redis operations use an atomic Lua script
([Redis documentation](https://redis.io/docs/latest/develop/programmability/eval-intro/)).
Row locks are held until the transaction ends
([PostgreSQL documentation](https://www.postgresql.org/docs/current/explicit-locking.html)).

The process-local forecast cache is disabled on PostgreSQL so another worker cannot
serve stale trust data. A shared versioned cache is a subsequent optimization; do
not re-enable process-local caching merely to improve a benchmark.

SMTP and large notification fan-outs still execute synchronously. A durable outbox,
worker retries, further list pagination and workload-specific tuning remain separate
work. ML dependencies still use version ranges in requirements-ml.txt; lock and audit
the complete Linux image, including Gunicorn and ML libraries, before release.

Local validation does not establish production TLS, backup reliability, legal
compliance, actual PostgreSQL throughput, or iOS build compatibility. Those require
the deployment environment and an Xcode build.

## Remove legacy demo data

Stop API writers and take a custom-format PostgreSQL dump of the database named
in the running container's DATABASE_URL (a restored database may have a different
name from POSTGRES_DB). Verify the dump by restoring it to an isolated database.
Keep the current DATABASE_URL and credentials; do not replace the host env with a
local example or delete Docker volumes.

`flask purge-demo` previews row counts. `flask purge-demo --apply` deletes users
whose device_id starts with demo- and their dependent records in one transaction.
Real accounts, password administrators, catalogs and primary-key sequences survive.
If an administrator still uses the old public demo password, supply a protected
file via `--admin-password-file /path/to/password`. The command refuses to proceed
without an active password administrator and a replacement for a weak password.
Admin sessions are invalidated. Cleanup is never run automatically on startup.

Rebuild/recreate only the backend, then check health, empty event/organization
lists, rejection of demo session requests and password admin login. Deploy the web
client separately to remove its old demo controls and offline synthetic fallback.
