import "reflect-metadata";
import { readFileSync } from "node:fs";

function loadEnvFile(path: string): void {
  try {
    const content = readFileSync(path, "utf8");
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const value = trimmed.slice(eqIdx + 1).trim();
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    // Optional local env files may be absent. RuntimeConfigService validates
    // required configuration before any listener is opened.
  }
}
loadEnvFile(".env");
loadEnvFile("backend/.env");

import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { ApiExceptionFilter } from "./common/api-exception.filter";
import { ValidationPipe } from "@nestjs/common";
import { corsOptionsFromEnvironment } from "./cors.config";
import { RuntimeConfigService } from "./runtime-config.service";
import { runtimeTransportParser, startRuntimeTls } from "./trusted-runtime/runtime-tls";

async function bootstrap(): Promise<void> {
  new RuntimeConfigService().assertSafe();

  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.use("/api/trusted-runtime/transport", runtimeTransportParser());
  app.setGlobalPrefix("api");
  app.enableCors(corsOptionsFromEnvironment());
  app.useGlobalFilters(new ApiExceptionFilter());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port, "0.0.0.0");
  await startRuntimeTls(app);
}

void bootstrap();
