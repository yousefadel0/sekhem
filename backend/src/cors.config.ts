import type { CorsOptions } from "@nestjs/common/interfaces/external/cors-options.interface";

type CorsEnvironment = { SEKHEM_CORS_ALLOWED_ORIGINS?: string };

export function corsOptionsFromEnvironment(environment: CorsEnvironment = process.env): CorsOptions {
  const allowedOrigins = new Set(
    (environment.SEKHEM_CORS_ALLOWED_ORIGINS ?? "")
      .split(",")
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0 && origin !== "*")
  );

  return {
    origin(origin, callback) {
      callback(null, origin === undefined || allowedOrigins.has(origin));
    },
    credentials: true,
    methods: ["GET", "POST", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"]
  };
}
