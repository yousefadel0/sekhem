import { BadRequestException } from "@nestjs/common";
import { createHash } from "node:crypto";
import { isIP } from "node:net";

export type SshTargetStatus = "REGISTERED" | "REVOKED";
export interface SshTargetConfiguration {
  host: string;
  port: number;
  username: string;
  hostFingerprint: string;
  credentialRef: string;
  status: SshTargetStatus;
}
export type SshValidationStatus = "PENDING" | "VERIFIED" | "HOST_KEY_MISMATCH" | "AUTHENTICATION_FAILED" | "CONNECTION_FAILED" | "TIMEOUT" | "CREDENTIAL_UNAVAILABLE" | "STALE";
export const sshDigest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function sshId(value: unknown): string {
  if (typeof value !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(value)) throw new BadRequestException("SSH_IDENTIFIER_INVALID");
  return value;
}
export function exactKeys(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).sort().join() !== keys.sort().join()) throw new BadRequestException("SSH_REQUEST_INVALID");
  return value as Record<string, unknown>;
}
export function sshConfiguration(value: unknown): SshTargetConfiguration {
  const v = exactKeys(value, ["host", "port", "username", "hostFingerprint", "credentialRef", "status"]);
  if (typeof v.host !== "string" || v.host.length > 253 || !(isIP(v.host) || /^(?=.{1,253}$)[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?$/.test(v.host)) || v.host.includes("..")) throw new BadRequestException("SSH_HOST_INVALID");
  if (!Number.isInteger(v.port) || (v.port as number) < 1 || (v.port as number) > 65535) throw new BadRequestException("SSH_PORT_INVALID");
  if (typeof v.username !== "string" || !/^[a-zA-Z0-9_.-]{1,64}$/.test(v.username)) throw new BadRequestException("SSH_USERNAME_INVALID");
  if (typeof v.hostFingerprint !== "string" || !/^SHA256:[A-Za-z0-9+/]{43}$/.test(v.hostFingerprint) || Buffer.from(v.hostFingerprint.slice(7), "base64").toString("base64").replace(/=+$/, "") !== v.hostFingerprint.slice(7)) throw new BadRequestException("SSH_HOST_PIN_REQUIRED");
  if (v.status !== "REGISTERED" && v.status !== "REVOKED") throw new BadRequestException("SSH_STATUS_INVALID");
  return { host: v.host, port: v.port as number, username: v.username, hostFingerprint: v.hostFingerprint, credentialRef: sshId(v.credentialRef), status: v.status };
}
