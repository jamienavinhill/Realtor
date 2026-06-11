"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, type User } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { Building2, CheckCircle2, Loader2 } from "lucide-react";
import { auth, db, googleProvider, signInWithPopup } from "@/lib/firebase";
import { getErrorMessage } from "@/lib/errors";
import type { AccountInvite } from "@/types/sharing";

/**
 * Client orchestration for accepting a workspace invite (WS18). Flow:
 *  1. Resolve auth state. If signed out, offer Google sign-in.
 *  2. Read the invite by token (rules permit the owner or the invited-email user to read).
 *  3. Show the role + status with honest loading/empty/error/mismatch states.
 *  4. On accept, call `POST /api/account/accept`; the server matches the verified email
 *     and writes the membership transactionally.
 */
type InviteState =
  | { phase: "loading" }
  | { phase: "needs-auth" }
  | { phase: "ready"; invite: AccountInvite }
  | { phase: "accepted" }
  | { phase: "error"; message: string };

export function InviteAcceptClient({ token }: { token: string }) {
  const router = useRouter();
  const [user, setUser] = React.useState<User | null>(null);
  const [authReady, setAuthReady] = React.useState(false);
  const [state, setState] = React.useState<InviteState>({ phase: "loading" });
  const [accepting, setAccepting] = React.useState(false);

  React.useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  React.useEffect(() => {
    if (!authReady) return;
    if (!user) {
      setState({ phase: "needs-auth" });
      return;
    }
    let cancelled = false;
    (async () => {
      setState({ phase: "loading" });
      try {
        const snap = await getDoc(doc(db, "invites", token));
        if (cancelled) return;
        if (!snap.exists()) {
          setState({ phase: "error", message: "This invite no longer exists." });
          return;
        }
        const invite = { token, ...snap.data() } as AccountInvite;
        if (invite.status === "revoked") {
          setState({ phase: "error", message: "This invite has been revoked." });
          return;
        }
        if (invite.status === "accepted") {
          setState({ phase: "error", message: "This invite has already been accepted." });
          return;
        }
        setState({ phase: "ready", invite });
      } catch {
        if (!cancelled) {
          // A permission-denied here means the signed-in email does not match the invite.
          setState({
            phase: "error",
            message:
              "This invite was sent to a different email address. Sign in with the invited Google account.",
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authReady, user, token]);

  async function handleSignIn() {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (e: unknown) {
      setState({ phase: "error", message: getErrorMessage(e) });
    }
  }

  async function handleAccept() {
    if (!user) return;
    setAccepting(true);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/account/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ token }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `Accept failed (${res.status})`);
      }
      setState({ phase: "accepted" });
    } catch (e: unknown) {
      setState({ phase: "error", message: getErrorMessage(e) });
    } finally {
      setAccepting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-stone-50 px-4 dark:bg-stone-950">
      <div className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-6 shadow-sm dark:border-stone-800 dark:bg-stone-900">
        <div className="mb-4 flex items-center gap-2">
          <div className="bg-primary-500/10 text-primary-500 rounded-lg p-2">
            <Building2 className="h-5 w-5" />
          </div>
          <span className="text-lg font-bold tracking-tight text-stone-900 dark:text-white">
            Abode Alerts
          </span>
        </div>

        {state.phase === "loading" ? (
          <div className="flex items-center gap-2 py-8 text-sm text-stone-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Checking your invite…
          </div>
        ) : state.phase === "needs-auth" ? (
          <div className="space-y-4">
            <p className="text-sm text-stone-600 dark:text-stone-300">
              You&apos;ve been invited to collaborate on an Abode Alerts workspace. Sign in with the
              invited Google account to continue.
            </p>
            <button
              type="button"
              onClick={handleSignIn}
              className="bg-primary-500 hover:bg-primary-600 w-full rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition"
            >
              Sign in with Google
            </button>
          </div>
        ) : state.phase === "ready" ? (
          <div className="space-y-4">
            <p className="text-sm text-stone-600 dark:text-stone-300">
              You&apos;ve been invited as a{" "}
              <span className="font-semibold text-stone-900 dark:text-stone-100">
                {state.invite.role}
              </span>{" "}
              ({state.invite.role === "editor" ? "can view and edit" : "read-only"}).
            </p>
            <button
              type="button"
              onClick={handleAccept}
              disabled={accepting}
              className="bg-primary-500 hover:bg-primary-600 inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition disabled:opacity-60"
            >
              {accepting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Accept invitation
            </button>
          </div>
        ) : state.phase === "accepted" ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-5 w-5" /> Invitation accepted
            </div>
            <p className="text-sm text-stone-600 dark:text-stone-300">
              You now have access to the shared workspace. Open the dashboard and use the workspace
              switcher to view it.
            </p>
            <button
              type="button"
              onClick={() => router.push("/")}
              className="bg-primary-500 hover:bg-primary-600 w-full rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition"
            >
              Go to dashboard
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="rounded-lg border border-amber-500/40 bg-amber-50 px-3 py-2.5 text-sm text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
              {state.message}
            </p>
            <Link
              href="/"
              className="block w-full rounded-lg border border-stone-200 px-4 py-2.5 text-center text-sm font-semibold text-stone-700 transition hover:bg-stone-50 dark:border-stone-700 dark:text-stone-200 dark:hover:bg-stone-800"
            >
              Back to dashboard
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
