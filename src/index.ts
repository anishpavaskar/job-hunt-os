import app from "./app";

const PORT = parseInt(process.env.PORT || "3000", 10);

const server = app.listen(PORT, () => {
  const entry = {
    timestamp: new Date().toISOString(),
    level: "info",
    message: "server_started",
    port: PORT,
  };
  process.stdout.write(JSON.stringify(entry) + "\n");
});

// Graceful shutdown
function shutdown(signal: string): void {
  const entry = {
    timestamp: new Date().toISOString(),
    level: "info",
    message: "server_stopping",
    signal,
  };
  process.stdout.write(JSON.stringify(entry) + "\n");

  server.close(() => {
    process.exit(0);
  });

  // Force exit after 10s if connections don't close
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
