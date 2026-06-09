import assert from "node:assert/strict";
import test from "node:test";
import { randomBytes } from "node:crypto";
import {
  decodeEncryptionKey,
  decryptToken,
  encryptToken,
  TokenCipherFormatError,
  TokenCipherKeyError,
} from "@/lib/crypto/token-cipher";

const KEY = randomBytes(32);
const KEY_B64 = KEY.toString("base64");

test("round-trips a refresh token (encrypt then decrypt yields the original)", () => {
  const plaintext = "1//0g-fake-refresh-token-value-for-test-only";
  const encrypted = encryptToken(plaintext, KEY);
  assert.notEqual(encrypted, plaintext);
  assert.match(encrypted, /^v1\./);
  assert.equal(decryptToken(encrypted, KEY), plaintext);
});

test("accepts a base64 string key as well as a Buffer", () => {
  const encrypted = encryptToken("secret", KEY_B64);
  assert.equal(decryptToken(encrypted, KEY_B64), "secret");
});

test("each encryption uses a fresh IV (ciphertexts differ for the same plaintext)", () => {
  const a = encryptToken("same", KEY);
  const b = encryptToken("same", KEY);
  assert.notEqual(a, b);
  assert.equal(decryptToken(a, KEY), "same");
  assert.equal(decryptToken(b, KEY), "same");
});

test("tampering with the ciphertext is detected by the auth tag (throws on decrypt)", () => {
  const encrypted = encryptToken("secret", KEY);
  const parts = encrypted.split(".");
  // Flip a byte in the ciphertext segment.
  const ct = Buffer.from(parts[3], "base64url");
  ct[0] ^= 0xff;
  parts[3] = ct.toString("base64url");
  const tampered = parts.join(".");
  assert.throws(() => decryptToken(tampered, KEY));
});

test("decrypting with the wrong key throws (does not return garbage)", () => {
  const encrypted = encryptToken("secret", KEY);
  assert.throws(() => decryptToken(encrypted, randomBytes(32)));
});

test("rejects a malformed payload", () => {
  assert.throws(() => decryptToken("not-a-valid-token", KEY), TokenCipherFormatError);
});

test("rejects a key that is not 32 bytes", () => {
  assert.throws(
    () => decodeEncryptionKey(Buffer.from("short").toString("base64")),
    TokenCipherKeyError,
  );
  assert.throws(() => decodeEncryptionKey(undefined), TokenCipherKeyError);
});
