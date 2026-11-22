import express from 'express';
import cors from 'cors';
import { requestLogger } from './requestLogger.js';
import { identify, requireRole, DEMO_USERS } from './http/auth.js';
import { errorHandler, notFoundHandler } from './http/errors.js';
import { createCourseService } from './courses/courseService.js';
import { courseRoutes } from './courses/courseRoutes.js';
import { createMemoryCourseRepository } from './courses/courseRepository.memory.js';

// deps.db: the executor from db/sql.js, or undefined when running without a database.
// deps.repos: repositories, so tests and local runs can swap SQL for memory.
export function createApp(config, { log, db, repos = {} } = {}) {
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

  const courses = createCourseService(repos.courses ?? createMemoryCourseRepository());
  app.use('/courses', courseRoutes(courses));

  app.use(notFoundHandler);
  app.use(errorHandler(log));
  return app;
}
