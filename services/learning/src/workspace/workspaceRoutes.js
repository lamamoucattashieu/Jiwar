import { Router } from 'express';
import { requireRole } from '../http/auth.js';

const anyUser = requireRole('trainee', 'instructor', 'company', 'admin');
const staff = requireRole('instructor', 'admin');

// Thin HTTP layer over the workspace service.
export function workspaceRoutes(service) {
  const router = Router();

  router.post('/courses/:id/workspace', anyUser, async (req, res) => {
    res.json(await service.openWorkspace(req.user, req.params.id));
  });

  router.get('/repos', anyUser, async (req, res) => res.json({ items: await service.listRepos(req.user) }));
  router.get('/repos/:id', anyUser, async (req, res) =>
    res.json(await service.repo(req.user, req.params.id)),
  );
  router.get('/repos/:id/files', anyUser, async (req, res) => {
    res.json({ items: await service.files(req.user, req.params.id, req.query) });
  });
  router.get('/repos/:id/commits', anyUser, async (req, res) => {
    res.json({ items: await service.history(req.user, req.params.id, req.query) });
  });
  router.post('/repos/:id/branches', anyUser, async (req, res) => {
    res.status(201).json(await service.createBranch(req.user, req.params.id, req.body));
  });
  router.post('/repos/:id/commits', anyUser, async (req, res) => {
    res.status(201).json(await service.commit(req.user, req.params.id, req.body));
  });
  router.post('/repos/:id/pulls', anyUser, async (req, res) => {
    res.status(201).json(await service.openPull(req.user, req.params.id, req.body));
  });

  router.get('/reviews', staff, async (req, res) => res.json({ items: await service.reviewQueue(req.user) }));
  router.get('/pulls/:id', anyUser, async (req, res) =>
    res.json(await service.pull(req.user, req.params.id)),
  );
  router.post('/pulls/:id/comments', anyUser, async (req, res) => {
    res.status(201).json(await service.comment(req.user, req.params.id, req.body));
  });
  router.post('/pulls/:id/request-changes', anyUser, async (req, res) => {
    res.json(await service.requestChanges(req.user, req.params.id, req.body));
  });
  router.post('/pulls/:id/ai-review', anyUser, async (req, res) => {
    res.json(await service.aiReview(req.user, req.params.id));
  });
  router.post('/pulls/:id/approve', anyUser, async (req, res) => {
    res.json(await service.approve(req.user, req.params.id, req.body));
  });

  return router;
}
