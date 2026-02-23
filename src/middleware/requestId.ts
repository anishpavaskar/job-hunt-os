import { Request, Response, NextFunction } from "express";
import { v4 as uuidv4 } from "uuid";

declare global {
  namespace Express {
    interface Request {
      requestId: string;
    }
  }
}

/**
 * Attaches a unique requestId to every incoming request.
 * Accepts X-Request-Id from upstream (e.g. load balancer) or generates one.
 */
export function requestIdMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const incoming = req.headers["x-request-id"];
  req.requestId =
    typeof incoming === "string" && incoming.length > 0
      ? incoming
      : uuidv4();
  next();
}
