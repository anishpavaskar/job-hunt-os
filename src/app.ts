import express from "express";
import { requestIdMiddleware } from "./middleware/requestId";
import { loggerMiddleware } from "./middleware/logger";
import healthRoutes from "./routes/health";

const app = express();

// --- Middleware ---
app.use(requestIdMiddleware);
app.use(loggerMiddleware);

// --- Routes ---
app.use(healthRoutes);

// --- 404 fallback ---
app.use((_req, res) => {
  res.status(404).json({ error: "not_found" });
});

export default app;
