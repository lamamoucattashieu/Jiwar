// Versioned SQL migrations, applied in order on startup.
//
// Files live in migrations/ and are named NNN_description.sql (for example
// 001_create_courses.sql). Each file runs once, inside a transaction, and is
// recorded in schema_migrations with a checksum. Editing a file that has already
// been applied is an error: write a new migration instead.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const FILE_PATTERN = /^(\d{3})_([a-z0-9_]+)\.sql$/;

const CREATE_HISTORY_TABLE = `
IF OBJECT_ID('schema_migrations', 'U') IS NULL
  CREATE TABLE schema_migrations (
    version INT NOT NULL PRIMARY KEY,
    name NVARCHAR(200) NOT NULL,
    checksum CHAR(64) NOT NULL,
    applied_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
  );`;

// Line endings are normalised so a checkout on Windows gives the same checksum.
export function checksum(text) {
  return createHash('sha256').update(text.replace(/\r\n/g, '\n')).digest('hex');
}

// SQL Server tools use a line with only GO to separate batches; the driver does not.
export function splitBatches(text) {
  return text
    .replace(/\r\n/g, '\n')
    .split(/^\s*GO\s*$/im)
    .map((batch) => batch.trim())
    .filter(Boolean);
}

export function parseMigration(file, text) {
  const match = FILE_PATTERN.exec(file);
  if (!match) {
    throw new Error(`Migration file name "${file}" must look like 001_create_courses.sql`);
  }
  return {
    version: Number(match[1]),
    name: match[2],
    file,
    checksum: checksum(text),
    batches: splitBatches(text),
  };
}

export function loadMigrations(dir) {
  if (!existsSync(dir)) return [];
  const migrations = readdirSync(dir)
    .filter((file) => file.endsWith('.sql'))
    .sort()
    .map((file) => parseMigration(file, readFileSync(join(dir, file), 'utf8')));

  const seen = new Set();
  for (const m of migrations) {
    if (seen.has(m.version)) throw new Error(`Two migrations share version ${m.version}`);
    seen.add(m.version);
  }
  return migrations;
}

// db is the small executor from db/sql.js: query(text, params) and transaction(fn).
// Returns the number of migrations applied in this run.
export async function runMigrations(db, migrations, log = () => {}) {
  await db.query(CREATE_HISTORY_TABLE);
  const rows = await db.query('SELECT version, checksum FROM schema_migrations');
  const applied = new Map(rows.map((r) => [r.version, r.checksum]));

  let count = 0;
  for (const m of migrations) {
    if (applied.has(m.version)) {
      if (applied.get(m.version) !== m.checksum) {
        throw new Error(`Migration ${m.file} was changed after it was applied`);
      }
      continue;
    }

    const ran = await db.transaction(async (tx) => {
      // Only one instance migrates at a time, for example during a canary deploy
      // when two revisions start together. The lock is released at commit.
      await tx.query(
        "EXEC sp_getapplock @Resource = 'schema_migrations', @LockMode = 'Exclusive', @LockOwner = 'Transaction', @LockTimeout = 60000",
      );
      const done = await tx.query('SELECT 1 AS done FROM schema_migrations WHERE version = @version', {
        version: m.version,
      });
      if (done.length > 0) return false;

      for (const batch of m.batches) await tx.query(batch);
      await tx.query(
        'INSERT INTO schema_migrations (version, name, checksum) VALUES (@version, @name, @checksum)',
        { version: m.version, name: m.name, checksum: m.checksum },
      );
      return true;
    });

    if (ran) {
      count += 1;
      log(JSON.stringify({ msg: 'migration applied', version: m.version, name: m.name }));
    }
  }
  return count;
}
