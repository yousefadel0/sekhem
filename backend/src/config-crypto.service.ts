import { BadRequestException, Injectable, ServiceUnavailableException } from "@nestjs/common";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const VERSION = "v1";

@Injectable()
export class ConfigCryptoService {
  encrypt(value: string): string {
    const key = this.currentKey();
    const iv = randomBytes(12);
    const cipher = createCipheriv(ALGORITHM, key, iv);
    const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [VERSION, iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(":");
  }

  decrypt(value: string): string {
    const parts = value.split(":");
    if (parts.length !== 4 || parts[0] !== VERSION) {
      throw new ServiceUnavailableException("Stored credential cannot be decrypted");
    }

    for (const key of this.decryptionKeys()) {
      try {
        const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(parts[1]!, "base64url"));
        decipher.setAuthTag(Buffer.from(parts[2]!, "base64url"));
        return Buffer.concat([decipher.update(Buffer.from(parts[3]!, "base64url")), decipher.final()]).toString("utf8");
      } catch {
        // Try the optional previous key during a controlled rotation window.
      }
    }

    throw new ServiceUnavailableException("Stored credential cannot be decrypted");
  }

  private currentKey(): Buffer {
    const value = process.env.SEKHEM_CONFIG_MASTER_KEY;
    if (!value) {
      throw new ServiceUnavailableException("Secure configuration master key is unavailable");
    }
    return this.parseKey(value);
  }

  private decryptionKeys(): Buffer[] {
    const keys = [this.currentKey()];
    const previous = process.env.SEKHEM_CONFIG_MASTER_KEY_PREVIOUS;
    if (previous) {
      keys.push(this.parseKey(previous));
    }
    return keys;
  }

  private parseKey(value: string): Buffer {
    const key = /^[a-f0-9]{64}$/i.test(value) ? Buffer.from(value, "hex") : Buffer.from(value, "base64");
    if (key.length !== 32) {
      throw new BadRequestException("Secure configuration master key must decode to 32 bytes");
    }
    return key;
  }
}
