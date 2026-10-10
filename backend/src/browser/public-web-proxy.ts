import { createServer, request as httpRequest, type Server } from "node:http";
import { lookup } from "node:dns/promises";
import { connect } from "node:net";

// Resolve once and connect to that exact public IPv4 address. A DNS change
// between validation and connection cannot redirect the browser to the LAN.
export async function publicAddress(host: string): Promise<string> {
  const addresses = await lookup(host, { family: 4, all: true });
  if (!addresses.length || addresses.some(({ address }) => {
    const [a, b] = address.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224 || a === 169 && b === 254 ||
      a === 172 && b >= 16 && b <= 31 || a === 192 && [0, 168].includes(b) ||
      a === 100 && b >= 64 && b <= 127 || a === 198 && [18, 19, 51].includes(b) || a === 203 && b === 0;
  })) throw new Error("PUBLIC_WEB_ADDRESS_REQUIRED");
  return addresses[0].address;
}
export function webUrl(value: unknown): URL {
  if (typeof value !== "string" || value.length > 2048) throw new Error("WEB_URL_INVALID");
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password ||
    url.port && !["80", "443"].includes(url.port)) throw new Error("PUBLIC_HTTP_URL_REQUIRED");
  return url;
}
export async function startPublicWebProxy(): Promise<{ url: string; close: () => Promise<void> }> {
  const sockets = new Set<import("node:net").Socket>();
  const server: Server = createServer(async (incoming, outgoing) => {
    try {
      const url = webUrl(incoming.url), address = await publicAddress(url.hostname);
      if (url.protocol !== "http:") throw new Error();
      const headers: import("node:http").OutgoingHttpHeaders = { ...incoming.headers, host: url.host };
      delete headers["proxy-authorization"]; delete headers["proxy-connection"];
      const upstream = httpRequest({ hostname: address, port: 80, path: url.pathname + url.search, method: incoming.method, headers, timeout: 15000 }, response => {
        outgoing.writeHead(response.statusCode ?? 502, response.headers); response.pipe(outgoing);
      });
      upstream.on("timeout", () => upstream.destroy());
      upstream.on("error", () => { if (!outgoing.headersSent) outgoing.writeHead(502); outgoing.end(); });
      incoming.on("aborted", () => upstream.destroy()); incoming.pipe(upstream);
    } catch { outgoing.writeHead(403); outgoing.end("Public web access only"); }
  });
  server.on("connection", socket => { sockets.add(socket); socket.on("close", () => sockets.delete(socket)); });
  server.on("connect", async (incoming, downstream, head) => {
    try {
      const url = webUrl(`https://${incoming.url}`);
      if (url.port && url.port !== "443") throw new Error();
      const address = await publicAddress(url.hostname), upstream = connect({ host: address, port: 443 });
      sockets.add(upstream); upstream.on("close", () => sockets.delete(upstream));
      upstream.setTimeout(30000, () => upstream.destroy());
      upstream.on("error", () => downstream.destroy()); downstream.on("error", () => upstream.destroy());
      downstream.on("close", () => upstream.destroy());
      upstream.once("connect", () => { downstream.write("HTTP/1.1 200 Connection Established\r\n\r\n"); if (head.length) upstream.write(head); upstream.pipe(downstream); downstream.pipe(upstream); });
    } catch { downstream.end("HTTP/1.1 403 Forbidden\r\n\r\n"); }
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); if (!address || typeof address === "string") throw new Error("PROXY_START_FAILED");
  return { url: `http://127.0.0.1:${address.port}`, close: () => new Promise(resolve => { for (const socket of sockets) socket.destroy(); server.close(() => resolve()); }) };
}
