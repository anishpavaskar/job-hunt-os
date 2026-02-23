import { Router, Request, Response } from "express";

const router = Router();

/**
 * Liveness probe — "is the process alive?"
 * Always returns 200 if the event loop is running.
 * Idempotent, no side effects.
 */
router.get("/healthz", (_req: Request, res: Response) => {
  res.status(200).json({ status: "ok" });
});

/**
 * Readiness probe — "is the service ready to accept traffic?"
 * Extend this with downstream dependency checks (DB, cache, etc.)
 * when they are added.
 */
router.get("/readyz", (_req: Request, res: Response) => {
  // Future: add checks for DB connections, external services, etc.
  const ready = true;

  if (ready) {
    res.status(200).json({ status: "ready" });
  } else {
    res.status(503).json({ status: "not_ready" });
  }
});

export default router;
