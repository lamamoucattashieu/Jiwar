import { Router } from 'express';
import { requireRole } from '../http/auth.js';

const anyUser = requireRole('trainee', 'instructor', 'company', 'admin');
const staff = requireRole('instructor', 'admin');
const admin = requireRole('admin');

// Thin HTTP layer over the credit service. After a change, deliver the outbox
// events it created so the response reflects the new level and notifications;
// if delivery fails, the events stay in the outbox and are retried later.
export function creditRoutes(service, dispatcher) {
  const router = Router();
  const thenDeliver = async (work) => {
    const out = await work;
    await dispatcher.drain();
    return out;
  };

  router.post('/results', staff, async (req, res) => {
    res.status(201).json(await service.recordResult(req.user, req.body));
  });

  router.get('/verification-queue', admin, async (req, res) => {
    res.json({ items: await service.verificationQueue() });
  });

  router.post('/results/:id/verify', admin, async (req, res) => {
    res.json(await thenDeliver(service.verify(req.user, req.params.id)));
  });

  router.post('/results/:id/reject', admin, async (req, res) => {
    res.json(await thenDeliver(service.reject(req.user, req.params.id, req.body)));
  });

  router.get('/trainees/:id/progress', anyUser, async (req, res) => {
    res.json(await service.progress(req.user, req.params.id));
  });

  router.post('/trainees/:id/corrections', admin, async (req, res) => {
    res.status(201).json(await thenDeliver(service.correct(req.user, req.params.id, req.body)));
  });

  router.put('/trainees/:id/projects-paused', admin, async (req, res) => {
    res.json(await service.setProjectsPaused(req.user, req.params.id, req.body));
  });

  router.get('/permits', admin, async (req, res) => {
    res.json({ items: await service.permitOverview() });
  });

  router.put('/permits/:traineeId', admin, async (req, res) => {
    res.json(await thenDeliver(service.setPermit(req.user, req.params.traineeId, req.body)));
  });

  router.get('/notifications', anyUser, async (req, res) => {
    res.json({ items: await service.notifications(req.user) });
  });

  router.post('/notifications/:id/read', anyUser, async (req, res) => {
    await service.markRead(req.user, req.params.id);
    res.status(204).end();
  });

  return router;
}
