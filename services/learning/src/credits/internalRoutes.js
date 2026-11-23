import { Router } from 'express';

// Endpoints only the projects service calls, behind requireInternalKey (see app.js).
export function internalRoutes(service, dispatcher) {
  const router = Router();

  router.get('/trainees/:id/eligibility', async (req, res) => {
    res.json(await service.eligibility(req.params.id));
  });

  // 201 the first time, 200 when the projects service retries the same project.
  router.post('/project-credits', async (req, res) => {
    const { entry, created } = await service.awardProjectCredit(req.body);
    if (created) await dispatcher.drain();
    res.status(created ? 201 : 200).json(entry);
  });

  return router;
}
