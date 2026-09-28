export interface ServerConfig {
  port: number;
  host: string;
  production: boolean;
  apiAuthToken?: string;
  frontendOrigin?: string;
}

type Environment = Record<string, string | undefined>;

function parsePort(value: string | undefined): number {
  if (value === undefined || value.trim() === "") return 3001;
  if (!/^\d+$/.test(value)) throw new Error("PORT must be an integer between 1 and 65535.");
  const port = Number(value);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be an integer between 1 and 65535.");
  }
  return port;
}

function parseFrontendOrigin(value: string | undefined): string | undefined {
  if (value === undefined || value.trim() === "") return undefined;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("FRONTEND_ORIGIN must be a valid HTTP(S) origin without a path.");
  }
  if (
    !["http:", "https:"].includes(parsed.protocol) ||
    parsed.origin !== value ||
    parsed.username !== "" ||
    parsed.password !== "" ||
    parsed.pathname !== "/" ||
    parsed.search !== "" ||
    parsed.hash !== ""
  ) {
    throw new Error("FRONTEND_ORIGIN must be a valid HTTP(S) origin without a path.");
  }
  if (parsed.protocol !== "https:" && !["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname)) {
    throw new Error("FRONTEND_ORIGIN must use HTTPS outside localhost.");
  }
  return parsed.origin;
}

function isLoopback(host: string): boolean {
  return host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]";
}

export function loadServerConfig(env: Environment = process.env): ServerConfig {
  const port = parsePort(env.PORT);
  const production = env.NODE_ENV === "production";
  const host = env.HOST?.trim() || (production ? "0.0.0.0" : "127.0.0.1");
  const apiAuthToken = env.API_AUTH_TOKEN?.trim() || undefined;
  const frontendOrigin = parseFrontendOrigin(env.FRONTEND_ORIGIN);

  if (apiAuthToken && apiAuthToken.length < 32) {
    throw new Error("API_AUTH_TOKEN must contain at least 32 characters.");
  }
  if ((production || !isLoopback(host)) && !apiAuthToken) {
    throw new Error("API_AUTH_TOKEN is required in production and when binding beyond loopback.");
  }
  if (production && !frontendOrigin) {
    throw new Error("FRONTEND_ORIGIN is required in production.");
  }

  return { port, host, production, apiAuthToken, frontendOrigin };
}
