import fs from "fs";
import http from "http";
import path from "path";
import { spawn } from "child_process";
import { google } from "googleapis";
import type { AddressInfo } from "net";

interface InstalledCredentials {
  installed: {
    client_id: string;
    client_secret: string;
  };
}

const PROJECT_ROOT = path.resolve(__dirname, "..");
const CREDENTIALS_PATH = path.join(PROJECT_ROOT, "credentials.json");
const DEFAULT_PORT = 3000;
const SCOPES = [
  "https://www.googleapis.com/auth/documents",
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/gmail.compose",
];

function readCredentials(): InstalledCredentials {
  if (!fs.existsSync(CREDENTIALS_PATH)) {
    throw new Error(
      `Missing credentials.json at ${CREDENTIALS_PATH}. ` +
      "Place your Google OAuth Desktop client JSON there and rerun npm run google-auth.",
    );
  }

  const raw = fs.readFileSync(CREDENTIALS_PATH, "utf8");
  const parsed = JSON.parse(raw) as Partial<InstalledCredentials>;

  if (!parsed.installed?.client_id || !parsed.installed?.client_secret) {
    throw new Error("credentials.json is missing installed.client_id or installed.client_secret");
  }

  return {
    installed: {
      client_id: parsed.installed.client_id,
      client_secret: parsed.installed.client_secret,
    },
  };
}

function openBrowser(url: string): void {
  if (process.platform === "darwin") {
    spawn("open", [url], { detached: true, stdio: "ignore" }).unref();
    return;
  }

  if (process.platform === "win32") {
    spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore" }).unref();
    return;
  }

  spawn("xdg-open", [url], { detached: true, stdio: "ignore" }).unref();
}

async function listenOnAvailablePort(server: http.Server, startPort = DEFAULT_PORT): Promise<number> {
  for (let port = startPort; port < startPort + 10; port += 1) {
    try {
      await new Promise<void>((resolve, reject) => {
        const onError = (error: NodeJS.ErrnoException) => {
          server.off("listening", onListening);
          reject(error);
        };
        const onListening = () => {
          server.off("error", onError);
          resolve();
        };

        server.once("error", onError);
        server.once("listening", onListening);
        server.listen(port);
      });

      return (server.address() as AddressInfo).port;
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code !== "EADDRINUSE") {
        throw err;
      }
    }
  }

  throw new Error(`Could not bind a callback server on localhost ports ${startPort}-${startPort + 9}`);
}

async function main(): Promise<void> {
  const credentials = readCredentials();
  const server = http.createServer();
  const callbackPort = await listenOnAvailablePort(server);
  const redirectUri = `http://localhost:${callbackPort}/callback`;
  const oauth2Client = new google.auth.OAuth2(
    credentials.installed.client_id,
    credentials.installed.client_secret,
    redirectUri,
  );
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
  });

  if (callbackPort !== DEFAULT_PORT) {
    console.log(`Port ${DEFAULT_PORT} is busy. Using callback port ${callbackPort} instead.`);
  }

  const tokenPromise = new Promise<void>((resolve, reject) => {
    server.removeAllListeners("request");
    server.on("request", async (req, res) => {
      try {
        const requestUrl = new URL(req.url ?? "/", redirectUri);

        if (requestUrl.pathname !== "/callback") {
          res.statusCode = 404;
          res.setHeader("Content-Type", "text/plain");
          res.end("Not found");
          return;
        }

        const code = requestUrl.searchParams.get("code");
        const error = requestUrl.searchParams.get("error");

        if (error) {
          res.statusCode = 400;
          res.setHeader("Content-Type", "text/html");
          res.end(`<html><body><h1>Auth failed</h1><p>${error}</p></body></html>`);
          server.close(() => reject(new Error(`Google OAuth failed: ${error}`)));
          return;
        }

        if (!code) {
          res.statusCode = 400;
          res.setHeader("Content-Type", "text/html");
          res.end("<html><body><h1>Missing code</h1></body></html>");
          server.close(() => reject(new Error("Missing code query parameter in OAuth callback")));
          return;
        }

        const { tokens } = await oauth2Client.getToken(code);
        const refreshToken = tokens.refresh_token;

        res.statusCode = 200;
        res.setHeader("Content-Type", "text/html");
        res.end("<html><body><h1>Auth complete.</h1><p>You can close this tab.</p></body></html>");

        server.close(() => {
          if (!refreshToken) {
            reject(
              new Error(
                "No refresh token returned. Revoke the app in your Google account, then rerun with prompt=consent.",
              ),
            );
            return;
          }

          console.log("");
          console.log("Add these to your .env:");
          console.log(`GOOGLE_CLIENT_ID=${credentials.installed.client_id}`);
          console.log(`GOOGLE_CLIENT_SECRET=${credentials.installed.client_secret}`);
          console.log(`GOOGLE_REFRESH_TOKEN=${refreshToken}`);
          resolve();
        });
      } catch (error) {
        if (!res.headersSent) {
          res.statusCode = 500;
          res.setHeader("Content-Type", "text/html");
          res.end("<html><body><h1>Auth failed.</h1><p>Check the terminal.</p></body></html>");
        }

        server.close(() => reject(error instanceof Error ? error : new Error(String(error))));
      }
    });

    server.on("error", (error) => {
      reject(error);
    });
  });

  console.log("Opening Google OAuth consent screen...");
  console.log(authUrl);
  openBrowser(authUrl);

  await tokenPromise;
}

main().catch((error) => {
  console.error("[google-auth]", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
