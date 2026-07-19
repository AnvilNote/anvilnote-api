import type { CorsOptions } from "cors";
import { env } from "./env";

const localhostDefaults = [
  "http://localhost:3000",
  "http://localhost:5173",
  "http://localhost:5174",
];

const configuredOrigins = env.CORS_ORIGIN.split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const allowedOrigins = Array.from(new Set([...localhostDefaults, ...configuredOrigins]));

export const corsOptions: CorsOptions = {
  origin(origin, callback) {
    if (!origin) {
      callback(null, true);
      return;
    }

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error(`CORS blocked for origin: ${origin}`));
  },
  credentials: env.CORS_CREDENTIALS,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-Request-Id",
    "X-AnvilNote-AI-Credential",
    "X-AnvilNote-Desktop-Token",
  ],
};

export { allowedOrigins };
