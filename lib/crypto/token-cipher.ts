import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Authenticated symmetric encryption for at-rest secrets (the Google OAuth refresh
 * token persisted under `users/{uid}/gmailSync`). Uses AES-256-GCM: confidentiality
 * + integrity (the auth tag detects tampering on decrypt).
 *
 * The key comes from the `TOKEN_ENCRYPTION_KEY` server env, a base64-encoded 32-byte
 * (256-bit) value. It is server-only and never reaches the client. The encrypted
 * payload is a single self-describing string so it can live in one Firestore field.
 *
 * Wire format (all base64url, dot-separated): `v1.<iv>.<authTag>.<ciphertext>`.
 *   - `v1`      version tag (lets us rotate the scheme later)
 *   - `iv`      12-byte random nonce (GCM standard); a fresh one per encryption
 *   - `authTag` 16-byte GCM authentication tag
 *   - `ciphertext` the encrypted UTF-8 plaintext
 */
const SCHEME_VERSION = "v1";
const IV_LENGTH_BYTES = 12;
const KEY_LENGTH_BYTES = 32;
const ALGORITHM = "aes-256-gcm";

export class TokenCipherKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TokenCipherKeyError";
  }
}

export class TokenCipherFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TokenCipherFormatError";
  }
}

function toB64Url(buffer: Buffer): string {
  return buffer.toString("base64url");
}

function fromB64Url(value: string): Buffer {
  return Buffer.from(value, "base64url");
}

/**
 * Decode and validate the 32-byte key from a base64 string. Accepts both standard
 * base64 and base64url. Throws a clear, non-leaking error when missing or wrong size.
 */
export function decodeEncryptionKey(rawKey: string | undefined): Buffer {
  if (!rawKey || rawKey.trim().length === 0) {
    throw new TokenCipherKeyError(
      "TOKEN_ENCRYPTION_KEY is not set. Provide a base64-encoded 32-byte key.",
    );
  }
  const trimmed = rawKey.trim();
  // Buffer.from with "base64" already tolerates base64url chars in modern Node, but
  // normalize explicitly so either encoding is accepted.
  const normalized = trimmed.replace(/-/g, "+").replace(/_/g, "/");
  const key = Buffer.from(normalized, "base64");
  if (key.length !== KEY_LENGTH_BYTES) {
    throw new TokenCipherKeyError(
      `TOKEN_ENCRYPTION_KEY must decode to ${KEY_LENGTH_BYTES} bytes, got ${key.length}.`,
    );
  }
  return key;
}

function resolveKey(key?: Buffer | string): Buffer {
  if (Buffer.isBuffer(key)) {
    if (key.length !== KEY_LENGTH_BYTES) {
      throw new TokenCipherKeyError(`Encryption key must be ${KEY_LENGTH_BYTES} bytes.`);
    }
    return key;
  }
  return decodeEncryptionKey(key ?? process.env.TOKEN_ENCRYPTION_KEY);
}

/** Encrypt a UTF-8 plaintext into the self-describing `v1.<iv>.<tag>.<ct>` string. */
export function encryptToken(plaintext: string, key?: Buffer | string): string {
  const resolvedKey = resolveKey(key);
  const iv = randomBytes(IV_LENGTH_BYTES);
  const cipher = createCipheriv(ALGORITHM, resolvedKey, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [SCHEME_VERSION, toB64Url(iv), toB64Url(authTag), toB64Url(ciphertext)].join(".");
}

/** Decrypt a `v1.<iv>.<tag>.<ct>` string back to UTF-8 plaintext. Throws on tamper. */
export function decryptToken(encoded: string, key?: Buffer | string): string {
  const resolvedKey = resolveKey(key);
  const parts = encoded.split(".");
  if (parts.length !== 4 || parts[0] !== SCHEME_VERSION) {
    throw new TokenCipherFormatError("Encrypted token is not in the expected v1 format.");
  }

  const [, ivB64, tagB64, ctB64] = parts;
  const iv = fromB64Url(ivB64);
  const authTag = fromB64Url(tagB64);
  const ciphertext = fromB64Url(ctB64);

  if (iv.length !== IV_LENGTH_BYTES) {
    throw new TokenCipherFormatError("Encrypted token has a malformed IV.");
  }

  const decipher = createDecipheriv(ALGORITHM, resolvedKey, iv);
  decipher.setAuthTag(authTag);
  // .final() throws if the auth tag does not verify (tampered ciphertext/key).
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
