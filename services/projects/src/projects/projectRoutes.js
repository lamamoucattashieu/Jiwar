import { Router } from 'express';
import { requireRole } from '../http/auth.js';

const anyUser = requireRole('trainee', 'instructor', 'company', 'admin');
const company = requireRole('company');
const admin = requireRole('admin');

// Thin HTTP layer. Workflow actions all look the same: POST /projects/:id/<action>.
export function projectRoutes(service, outbox) {
  const router = Router();

  // Public pages: no demo user needed.
  router.get('/packs', async (req, res) => res.json({ items: await service.packs() }));
  router.get('/showcase', async (req, res) => res.json({ items: await service.showcase() }));
  router.get('/portfolio/:traineeId', async (req, res) =>
    res.json(await service.portfolio(req.params.traineeId)),
  );

  router.post('/ai/brief', company, async (req, res) => {
    res.json(await service.suggestBrief(req.user, req.body));
  });

  router.post('/projects', company, async (req, res) => {
    res.status(201).json(await service.request(req.user, req.body));
  });
  router.get('/projects', anyUser, async (req, res) => {
    res.json({ items: await service.list(req.user, req.query) });
  });
  router.get('/projects/:id', anyUser, async (req, res) => {
    res.json(await service.details(req.user, req.params.id));
  });
  router.get('/projects/:id/candidates', admin, async (req, res) => {
    res.json({ items: await service.candidates(req.user, req.params.id) });
  });

  const actions = {
    quote: service.quote,
    accept: service.accept,
    assign: service.assign,
    submit: service.submit,
    'request-revision': service.requestRevision,
    approve: service.approve,
    cancel: service.cancel,
    rate: service.rate,
  };
  for (const [path, run] of Object.entries(actions)) {
    router.post(`/projects/:id/${path}`, anyUser, async (req, res) => {
      const project = await run(req.user, req.params.id, req.body ?? {});
      // Approving writes an outbox event for the learning service; try to deliver it now.
      if (path === 'approve') await outbox.drain();
      res.json(project);
    });
  }

  router.post('/projects/:id/messages', anyUser, async (req, res) => {
    res.status(201).json(await service.addMessage(req.user, req.params.id, req.body));
  });

  router.get('/invoices', anyUser, async (req, res) => res.json({ items: await service.invoices(req.user) }));
  router.get('/payouts', anyUser, async (req, res) => res.json({ items: await service.payouts(req.user) }));

  return router;
}
