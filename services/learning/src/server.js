import { fileURLToPath } from 'node:url';
import { loadConfig } from './config.js';
import { createApp } from './app.js';
import { connectWithRetry, createExecutor } from './db/sql.js';
import { loadMigrations, runMigrations } from './db/migrate.js';
import { createSqlCourseRepository } from './courses/courseRepository.sql.js';

const config = loadConfig();
const log = (line) => console.log(line);

let db;
let repos = {};
if (config.databaseUrl) {
  db = createExecutor(await connectWithRetry(config.databaseUrl, { log }));
  const dir = fileURLToPath(new URL('../migrations', import.meta.url));
  const applied = await runMigrations(db, loadMigrations(dir), log);
  log(JSON.stringify({ msg: 'migrations up to date', applied }));
  repos = { courses: createSqlCourseRepository(db) };
} else {
  log(JSON.stringify({ msg: 'DATABASE_URL not set, using in-memory storage' }));
}

const server = createApp(config, { log, db, repos }).listen(config.port, '0.0.0.0', () => {
  log(JSON.stringify({ msg: `${config.serviceName} listening`, port: config.port }));
});

// Container Apps and docker compose stop containers with SIGTERM.
process.on('SIGTERM', () => {
  server.close(async () => {
    await db?.close();
    process.exit(0);
  });
});
