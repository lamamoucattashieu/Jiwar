import { Router } from 'express';
import { requireRole } from '../http/auth.js';

// Express 5 forwards rejected promises to the error handler, so the handlers
// can stay plain async functions.
export function courseRoutes(service) {
  const router = Router();
  const staff = requireRole('instructor', 'admin');

  router.get('/', async (req, res) => {
    res.json({ items: await service.list(req.user, req.query) });
  });

  router.get('/:id', async (req, res) => {
    res.json(await service.get(req.user, req.params.id));
  });

  router.post('/', staff, async (req, res) => {
    const course = await service.create(req.user, req.body);
    res.status(201).location(`/courses/${course.id}`).json(course);
  });

  router.put('/:id', staff, async (req, res) => {
    res.json(await service.update(req.user, req.params.id, req.body));
  });

  router.delete('/:id', staff, async (req, res) => {
    await service.remove(req.user, req.params.id);
    res.status(204).end();
  });

  return router;
}
