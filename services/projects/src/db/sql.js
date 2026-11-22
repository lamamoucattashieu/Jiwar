// The only file that talks to the mssql driver. Everything else receives the
// small executor returned by createExecutor, so it can be replaced in tests.
import sql from 'mssql';
import { toConnectionConfig } from './databaseUrl.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Azure SQL serverless pauses when idle and takes up to a minute to resume, so
// the first connection is retried instead of crashing the container.
export async function connectWithRetry(url, { attempts = 15, delayMs = 5000, log = console.log } = {}) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await new sql.ConnectionPool(toConnectionConfig(url)).connect();
    } catch (err) {
      if (attempt >= attempts) throw err;
      log(JSON.stringify({ msg: 'database not ready, retrying', attempt, error: err.code ?? err.message }));
      await sleep(delayMs);
    }
  }
}

function bind(request, params) {
  for (const [name, value] of Object.entries(params)) request.input(name, value);
  return request;
}

export function createExecutor(pool) {
  return {
    async query(text, params = {}) {
      const result = await bind(pool.request(), params).query(text);
      return result.recordset ?? [];
    },

    async transaction(fn) {
      const tx = new sql.Transaction(pool);
      await tx.begin();
      const inTx = {
        async query(text, params = {}) {
          const result = await bind(new sql.Request(tx), params).query(text);
          return result.recordset ?? [];
        },
      };
      try {
        const out = await fn(inTx);
        await tx.commit();
        return out;
      } catch (err) {
        await tx.rollback();
        throw err;
      }
    },

    async ping() {
      await pool.request().query('SELECT 1 AS ok');
    },

    close: () => pool.close(),
  };
}
