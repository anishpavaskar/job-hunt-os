import { Request, Response, NextFunction } from "express";

/**
 * Structured JSON logger middleware.
 * Logs method, path, status, duration, and requestId.
 * Never logs raw request/response bodies or headers (secret safety).
 */
export function loggerMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const start = Date.now();

  res.on("finish", () => {
    const entry = {
      timestamp: new Date().toISOString(),
      level: res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info",
      requestId: req.requestId,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      durationMs: Date.now() - start,
    };
    process.stdout.write(JSON.stringify(entry) + "\n");
  });

  next();
}
