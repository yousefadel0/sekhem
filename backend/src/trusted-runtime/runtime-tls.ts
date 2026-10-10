import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { createServer, type Server } from "node:https";
import type { INestApplication } from "@nestjs/common";
import { ExpressAdapter } from "@nestjs/platform-express";

/** Runtime receipts can exceed Express's default 100 KiB after JSON escaping.
 * Scope the transport parser; ordinary application/auth routes keep their limits. */
export function runtimeTransportParser() {
  const transport = new ExpressAdapter();
  transport.useBodyParser("json", true, { limit: 524288 });
  return transport.getInstance();
}

/** Optional independent TLS listener; HTTP transport requests are always denied. */
export async function startRuntimeTls(app: INestApplication): Promise<Server | null> {
  const file = resolve(process.env.SEKHEM_RUNTIME_TLS_CONFIG ?? resolve(__dirname, "../../.runtime-state/tls.json"));
  if (!existsSync(file)) return null;
  const config = JSON.parse(readFileSync(file, "utf8"));
  const port = Number(config.port ?? 7443);
  if (!Number.isInteger(port) || port < 1024 || port > 65535 || typeof config.pfx !== "string" || typeof config.passphrase !== "string") throw new Error("RUNTIME_TLS_CONFIG_INVALID");
  const server = createServer({ pfx: readFileSync(resolve(dirname(file), config.pfx)), passphrase: config.passphrase, minVersion: "TLSv1.2" }, app.getHttpAdapter().getInstance());
  // Local MVP only. A remote deployment must deliberately configure its TLS front door.
  await new Promise<void>((ok, fail) => { server.once("error", fail); server.listen(port, "127.0.0.1", () => { server.removeListener("error", fail); ok(); }); });
  return server;
}
