import express, { type NextFunction, type Request, type Response } from "express";
import crypto from "node:crypto";

type RateLimitOptions = {
  windowMs: number;
  maxRequests: number;
};

const DEFAULT_DEV_ORIGINS = [
  "http://localhost:3000",
  "http://localhost:3001",
  "http://localhost:5173",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:3001",
  "http://127.0.0.1:5173",
];

const parseOrigins = (value?: string) => String(value || "")
  .split(",")
  .map((item) => item.trim().replace(/\/$/, ""))
  .filter(Boolean)
  .filter((item) => item !== "MY_APP_URL");

const getAllowedOrigins = () => new Set([
  ...DEFAULT_DEV_ORIGINS,
  ...parseOrigins(process.env.APP_URL),
  ...parseOrigins(process.env.FRONTEND_URL),
  ...parseOrigins(process.env.CORS_ORIGINS),
]);

const getRequestOrigins = (req: Request) => {
  const host = req.headers.host;
  if (!host) return new Set<string>();

  const forwardedProto = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim();
  const protocol = forwardedProto || req.protocol || "http";

  return new Set([
    `${protocol}://${host}`,
    `http://${host}`,
    `https://${host}`,
  ]);
};

const isOriginAllowed = (req: Request, origin?: string) => {
  if (!origin) return true;
  const normalizedOrigin = origin.replace(/\/$/, "");
  return getAllowedOrigins().has(normalizedOrigin) || getRequestOrigins(req).has(normalizedOrigin);
};

export const securityHeaders = (_req: Request, res: Response, next: NextFunction) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");

  if (process.env.NODE_ENV === "production") {
    res.setHeader("Strict-Transport-Security", "max-age=15552000; includeSubDomains");
  }

  next();
};

export const requestId = (req: Request, res: Response, next: NextFunction) => {
  const incomingId = String(req.headers["x-request-id"] || "").trim();
  const id = incomingId && incomingId.length <= 80 ? incomingId : crypto.randomUUID();
  res.locals.requestId = id;
  res.setHeader("X-Request-Id", id);
  next();
};

export const cors = (req: Request, res: Response, next: NextFunction) => {
  const origin = typeof req.headers.origin === "string" ? req.headers.origin : undefined;

  if (origin && isOriginAllowed(req, origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Authorization,Content-Type,X-Request-Id");
    res.setHeader("Access-Control-Max-Age", "86400");
  }

  if (req.method === "OPTIONS") {
    return isOriginAllowed(req, origin)
      ? res.status(204).end()
      : res.status(403).json({ error: "Origem nao permitida." });
  }

  if (origin && !isOriginAllowed(req, origin) && req.path.startsWith("/api/")) {
    return res.status(403).json({ error: "Origem nao permitida." });
  }

  return next();
};

export const bodyParser = (req: Request, res: Response, next: NextFunction) => {
  if (req.path === "/api/payments/webhook") {
    return express.raw({ type: "application/json", limit: process.env.WEBHOOK_BODY_LIMIT || "2mb" })(req, res, next);
  }

  const jsonLimit = req.path.startsWith("/api/fiscal/companies")
    ? process.env.FISCAL_BODY_LIMIT || "6mb"
    : process.env.JSON_BODY_LIMIT || "512kb";

  return express.json({ limit: jsonLimit, strict: true })(req, res, (error) => {
    if (!error) return next();

    const status = error.type === "entity.too.large" ? 413 : 400;
    const message = status === 413
      ? "Payload maior que o limite permitido."
      : "JSON invalido no corpo da requisicao.";
    return res.status(status).json({ error: message });
  });
};

const rateLimitBuckets = new Map<string, { count: number; resetAt: number }>();

export const rateLimit = ({ windowMs, maxRequests }: RateLimitOptions) => (req: Request, res: Response, next: NextFunction) => {
  if (req.method === "OPTIONS" || req.path === "/api/health") {
    return next();
  }

  const forwardedFor = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  const key = `${forwardedFor || req.ip || "unknown"}:${req.path}`;
  const now = Date.now();
  const bucket = rateLimitBuckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    rateLimitBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return next();
  }

  bucket.count += 1;
  if (bucket.count > maxRequests) {
    res.setHeader("Retry-After", Math.ceil((bucket.resetAt - now) / 1000));
    return res.status(429).json({ error: "Muitas requisicoes. Tente novamente em instantes." });
  }

  return next();
};

export const apiNotFound = (req: Request, res: Response) => {
  res.status(404).json({
    error: "Rota de API nao encontrada.",
    path: req.path,
  });
};

export const errorHandler = (error: unknown, _req: Request, res: Response, next: NextFunction) => {
  if (res.headersSent) {
    return next(error);
  }

  const requestIdValue = String(res.locals.requestId || "");
  console.error(`[${requestIdValue || "no-request-id"}] Unhandled API error:`, error);
  return res.status(500).json({
    error: "Erro interno do servidor.",
    requestId: requestIdValue || undefined,
  });
};
