import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toConnectionConfig } from '../src/db/databaseUrl.js';

test('turns an mssql:// URL into a driver config, decoding special characters', () => {
  const config = toConnectionConfig(
    'mssql://learning_user:p%40ss%3Bword@sqlserver:1433/learning?encrypt=true&trustServerCertificate=true',
  );
  assert.deepEqual(config, {
    server: 'sqlserver',
    port: 1433,
    database: 'learning',
    user: 'learning_user',
    password: 'p@ss;word',
    options: { encrypt: true, trustServerCertificate: true },
  });
});

test('defaults to port 1433, encryption on and certificate checks on (Azure)', () => {
  const config = toConnectionConfig('mssql://u:p@x.database.windows.net/db');
  assert.equal(config.port, 1433);
  assert.deepEqual(config.options, { encrypt: true, trustServerCertificate: false });
});

test('passes an ADO.NET connection string through unchanged', () => {
  const ado = 'Server=tcp:x.database.windows.net,1433;Database=db;User ID=u;Password=p;Encrypt=true';
  assert.equal(toConnectionConfig(ado), ado);
});
