import express from "express";
import cors from "cors";
import analyzeRouter from "./routes/analyze";
import checkpointRouter from "./routes/checkpoint";
import modernizationRouter from "./routes/modernization";

/**
 * Build the API app. Everything about the request pipeline is here so it can be
 * mounted by index.ts and by the test harness from ONE definition — a test that
 * assembles its own copy of the middleware stack proves nothing about the app
 * that actually serves requests.
 */
export function createApp(): express.Express {
  const app = express();

  app.use(cors({ origin: ["http://localhost:5173", "http://localhost:4173"] }));
  app.use(express.json({ limit: "1mb" }));

  // Mount routes
  app.use("/api", analyzeRouter);
  app.use("/api", checkpointRouter);
  app.use("/api", modernizationRouter);

  // 404 handler
  app.use((_req, res) => {
    res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Endpoint not found.", phase: "UNDERSTAND" } });
  });

  // Malformed JSON and an over-sized body are rejected by the body parser before
  // any route runs, and its default response is an HTML error page. A client
  // that parses every response as the API envelope must not receive HTML, so the
  // parser's own failures are restated in that envelope. The parser's message is
  // not forwarded: it echoes request content, and this API never echoes input.
  app.use((err: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (res.headersSent) {
      next(err);
      return;
    }
    const type = (err as { type?: string }).type;
    if (type === "entity.too.large") {
      res.status(413).json({
        success: false,
        error: { code: "BODY_TOO_LARGE", message: "Request body exceeds the 1MB limit.", phase: "UNDERSTAND" },
      });
      return;
    }
    if (type === "entity.parse.failed") {
      res.status(400).json({
        success: false,
        error: { code: "MALFORMED_BODY", message: "Request body is not valid JSON.", phase: "UNDERSTAND" },
      });
      return;
    }
    next(err);
  });

  return app;
}
