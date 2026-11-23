import { fileURLToPath } from 'node:url';
import { loadConfig } from './config.js';
import { createApp } from './app.js';
import { connectWithRetry, createExecutor } from './db/sql.js';
import { loadMigrations, runMigrations } from './db/migrate.js';
import { createSqlCourseRepository } from './courses/courseRepository.sql.js';
import { createSqlCreditStore } from './credits/creditStore.sql.js';
import { createSqlWorkspaceStore } from './workspace/workspaceStore.sql.js';

// Retry outbox events whose first delivery failed. Only while the container runs:
// Container Apps stops it when idle, so this never keeps Azure SQL awake.
const OUTBOX_RETRY_MS = 60_000;

const config = loadConfig();
const log = (line) => console.log(line);

let db;
let repos = {};
if (config.databaseUrl) {
  db = createExecutor(await connectWithRetry(config.databaseUrl, { log }));
  const dir = fileURLToPath(new URL('../migrations', import.meta.url));
  const applied = await runMigrations(db, loadMigrations(dir), log);
  log(JSON.stringify({ msg: 'migrations up to date', applied }));
  repos = {
    courses: createSqlCourseRepository(db),
    credits: createSqlCreditStore(db),
    workspace: createSqlWorkspaceStore(db),
  };
} else {
  log(JSON.stringify({ msg: 'DATABASE_URL not set, using in-memory storage' }));
}

const app = createApp(config, { log, db, repos });
const drainOutbox = () =>
  app.locals.outbox
    .drain()
    .catch((err) => log(JSON.stringify({ msg: 'outbox drain failed', error: err.message })));
await drainOutbox();
setInterval(drainOutbox, OUTBOX_RETRY_MS).unref();

const server = app.listen(config.port, '0.0.0.0', () => {
  log(JSON.stringify({ msg: `${config.serviceName} listening`, port: config.port }));
});

// Container Apps and docker compose stop containers with SIGTERM.
process.on('SIGTERM', () => {
  server.close(async () => {
    await db?.close();
    process.exit(0);
  });
});
