import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { createHash, timingSafeEqual } from "node:crypto";
import { Client } from "ssh2";
import type { SshTargetConfiguration, SshValidationStatus } from "./ssh-target.contract";

/** Server configuration only. Clients can reference a scoped entry, never an environment name/path/key. */
@Injectable()
export class SshCredentialResolver {
  resolve(ref: string, projectId: string, organizationId: string): { privateKey: Buffer; passphrase?: string } {
    try {
      const entries = JSON.parse(process.env.SEKHEM_SSH_CREDENTIAL_REFERENCES ?? "{}");
      const entry = Object.prototype.hasOwnProperty.call(entries, ref) ? entries[ref] : null;
      if (!entry || entry.projectId !== projectId || entry.organizationId !== organizationId || !/^SEKHEM_SSH_KEY_[A-Z0-9_]+$/.test(entry.privateKeyEnv)) throw new Error();
      const key = process.env[entry.privateKeyEnv];
      if (!key || Buffer.byteLength(key) > 32768) throw new Error();
      if (entry.passphraseEnv && !/^SEKHEM_SSH_PASSPHRASE_[A-Z0-9_]+$/.test(entry.passphraseEnv)) throw new Error();
      const passphrase = entry.passphraseEnv ? process.env[entry.passphraseEnv] : undefined;
      if (entry.passphraseEnv && !passphrase) throw new Error();
      return { privateKey: Buffer.from(key), passphrase };
    } catch { throw new ServiceUnavailableException("SSH_CREDENTIAL_UNAVAILABLE"); }
  }
}

export function verifySshHostKey(key: Buffer, fingerprint: string): boolean {
  const expected = Buffer.from(fingerprint.slice(7), "base64");
  const actual = createHash("sha256").update(key).digest();
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/** No channel/session APIs are exposed. Authentication success is connection evidence, not execution authority. */
@Injectable()
export class SshConnectionService {
  async validate(target: SshTargetConfiguration, credential: { privateKey: Buffer; passphrase?: string }): Promise<SshValidationStatus> {
    return new Promise(resolve => {
      const client = new Client();
      let settled = false, pinVerified = false, mismatch = false;
      const finish = (status: SshValidationStatus) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        client.destroy();
        credential.privateKey.fill(0);
        resolve(status);
      };
      const timer = setTimeout(() => finish("TIMEOUT"), 10000);
      client.once("ready", () => finish(pinVerified ? "VERIFIED" : "HOST_KEY_MISMATCH"));
      client.once("error", (error: Error & { level?: string }) => finish(mismatch ? "HOST_KEY_MISMATCH" : error.level === "client-authentication" ? "AUTHENTICATION_FAILED" : "CONNECTION_FAILED"));
      client.once("close", () => finish(mismatch ? "HOST_KEY_MISMATCH" : "CONNECTION_FAILED"));
      try {
        client.connect({ host: target.host, port: target.port, username: target.username, privateKey: credential.privateKey,
          passphrase: credential.passphrase, readyTimeout: 10000, tryKeyboard: false,
          hostVerifier: (key: Buffer) => { pinVerified = verifySshHostKey(key, target.hostFingerprint); mismatch = !pinVerified; return pinVerified; } });
      } catch { finish("CONNECTION_FAILED"); }
    });
  }
}
