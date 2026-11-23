import express from 'express';
import cors from 'cors';
import { requestLogger } from './requestLogger.js';
import { identify, requireRole, DEMO_USERS } from './http/auth.js';
import { errorHandler, notFoundHandler } from './http/errors.js';
import { createLearningClient } from './learningClient.js';
import { createOutboxDispatcher } from './outbox.js';
import { createMockPaymentProvider } from './payments/mockPaymentProvider.js';
import { EVENTS, createProjectService } from './projects/projectService.js';
import { createMemoryProjectStore } from './projects/projectStore.memory.js';
import { projectRoutes } from './projects/projectRoutes.js';

// deps.db: the executor from db/sql.js, or undefined when running without a database.
// deps.repos.projects, deps.learning, deps.payments: adapters, so tests can swap them.
export function createApp(config, { log, db, repos = {}, learning, payments } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(requestLogger(log));
  app.use(cors({ origin: config.corsOrigin }));
  app.use(express.json({ limit: '1mb' }));

  // Shallow on purpose: Container Apps and the pipeline call this often, and a
  // database query here would stop Azure SQL serverless from ever auto-pausing.
  app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', service: config.serviceName, version: config.version });
  });

  // Deep check, used after a deploy and when debugging.
  app.get('/health/db', async (req, res) => {
    if (!db) return res.status(200).json({ database: 'not configured' });
    try {
      await db.ping();
      return res.status(200).json({ database: 'ok' });
    } catch {
      return res.status(503).json({ database: 'unreachable' });
    }
  });

  app.use(identify);
  app.get('/demo-users', (req, res) => res.json({ items: DEMO_USERS }));
  app.get('/me', requireRole('trainee', 'instructor', 'company', 'admin'), (req, res) => {
    res.json(req.user);
  });

  const store = repos.projects ?? createMemoryProjectStore();
  const learningClient =
    learning ?? createLearningClient({ baseUrl: config.learningUrl, internalKey: config.internalApiKey });
  const service = createProjectService({
    store,
    learning: learningClient,
    payments: payments ?? createMockPaymentProvider(),
  });
  // An approved project becomes credits in the learning service, retried until it gets there.
  const outbox = createOutboxDispatcher({
    store,
    handlers: { [EVENTS.projectApproved]: (p) => learningClient.awardProjectCredit(p) },
    log,
  });
  app.use(projectRoutes(service, outbox));
  // server.js retries undelivered events on startup and on a timer.
  app.locals.outbox = outbox;

  app.use(notFoundHandler);
  app.use(errorHandler(log));
  return app;
}
