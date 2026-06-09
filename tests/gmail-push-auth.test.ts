import assert from "node:assert/strict";
import test from "node:test";
import {
  createPushVerifier,
  decodePushNotification,
  type PubSubPushBody,
} from "@/lib/gmail/pubsub-push";

const SA_EMAIL = "gmail-push@my-project.iam.gserviceaccount.com";

function pushBody(emailAddress = "jamie@example.test", historyId = "98765"): PubSubPushBody {
  const data = Buffer.from(JSON.stringify({ emailAddress, historyId })).toString("base64");
  return { message: { data, messageId: "m1" }, subscription: "projects/p/subscriptions/s" };
}

/** Fake OIDC verifier; never hits Google's cert endpoint. */
function fakeOauth(payload: Record<string, unknown> | null, throwErr = false) {
  return {
    async verifyIdToken() {
      if (throwErr) throw new Error("signature verification failed");
      return { getPayload: () => payload ?? undefined } as never;
    },
  };
}

test("rejects a request with no bearer token (401)", async () => {
  const verify = createPushVerifier(
    { expectedServiceAccountEmail: SA_EMAIL },
    { oauthClient: fakeOauth({}) },
  );
  const result = await verify({ authorizationHeader: null, body: pushBody() });
  assert.equal(result.ok, false);
  assert.equal(result.status, 401);
});

test("rejects a forged token whose signature fails verification (401)", async () => {
  const verify = createPushVerifier(
    { expectedServiceAccountEmail: SA_EMAIL },
    { oauthClient: fakeOauth(null, true) },
  );
  const result = await verify({
    authorizationHeader: "Bearer forged.jwt.value",
    body: pushBody(),
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 401);
});

test("rejects a token with the wrong issuer (401)", async () => {
  const verify = createPushVerifier(
    { expectedServiceAccountEmail: SA_EMAIL },
    {
      oauthClient: fakeOauth({
        iss: "https://evil.example",
        email: SA_EMAIL,
        email_verified: true,
      }),
    },
  );
  const result = await verify({ authorizationHeader: "Bearer x", body: pushBody() });
  assert.equal(result.ok, false);
  assert.equal(result.status, 401);
});

test("rejects a token whose email is not the configured push service account (401)", async () => {
  const verify = createPushVerifier(
    { expectedServiceAccountEmail: SA_EMAIL },
    {
      oauthClient: fakeOauth({
        iss: "https://accounts.google.com",
        email: "attacker@evil.example",
        email_verified: true,
      }),
    },
  );
  const result = await verify({ authorizationHeader: "Bearer x", body: pushBody() });
  assert.equal(result.ok, false);
  assert.equal(result.status, 401);
});

test("rejects when the shared secret is configured but absent/wrong, before any JWT work", async () => {
  let verifyCalled = false;
  const verify = createPushVerifier(
    { expectedSharedSecret: "s3cret", expectedServiceAccountEmail: SA_EMAIL },
    {
      oauthClient: {
        async verifyIdToken() {
          verifyCalled = true;
          return { getPayload: () => ({}) } as never;
        },
      },
    },
  );
  const result = await verify({
    authorizationHeader: "Bearer x",
    sharedSecretParam: "wrong",
    body: pushBody(),
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 401);
  assert.equal(verifyCalled, false, "JWT verification must not run when the shared secret fails");
});

test("accepts a valid token (correct issuer + service account + verified email)", async () => {
  const verify = createPushVerifier(
    { expectedServiceAccountEmail: SA_EMAIL, expectedSharedSecret: "s3cret" },
    {
      oauthClient: fakeOauth({
        iss: "https://accounts.google.com",
        email: SA_EMAIL,
        email_verified: true,
      }),
    },
  );
  const result = await verify({
    authorizationHeader: "Bearer valid",
    sharedSecretParam: "s3cret",
    body: pushBody("owner@example.test", "12321"),
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.notification, { emailAddress: "owner@example.test", historyId: "12321" });
});

test("decodePushNotification returns null for a malformed body", () => {
  assert.equal(decodePushNotification({}), null);
  assert.equal(decodePushNotification({ message: { data: "not-base64-json!!" } }), null);
  const noEmail = Buffer.from(JSON.stringify({ historyId: "1" })).toString("base64");
  assert.equal(decodePushNotification({ message: { data: noEmail } }), null);
});
