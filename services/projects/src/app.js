import express from 'express';
import cors from 'cors';
import { requestLogger } from './requestLogger.js';

export function createApp(config, { log } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(requestLogger(log));
  app.use(cors({ origin: config.corsOrigin }));
  app.use(express.json());

  // Sprint 0 skeleton: the database check is added together with migrations.
  app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', service: config.serviceName, version: config.version });
  });

  return app;
}
