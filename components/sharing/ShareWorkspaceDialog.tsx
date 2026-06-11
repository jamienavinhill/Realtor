"use client";

import * as React from "react";
import type { User } from "firebase/auth";
import { Copy, Loader2, Mail, ShieldCheck, Trash2, UserPlus } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { getErrorMessage } from "@/lib/errors";
import type { AccountInvite, AccountMember, MemberRole } from "@/types/sharing";

/**
 * "Share workspace" management UI (WS18). Lists current members + roles, an invite form
 * (email + viewer/editor), pending invites with revoke, and a copyable accept link.
 * Visible to the owner and editors of the workspace being viewed. Honest loading / empty
 * / error states throughout; matches the compact density of the auth chrome + dialogs.
 *
 * All mutations go through the authenticated `/api/account/*` routes (the caller's
 * Firebase ID token is attached); the client never writes member/invite docs directly.
 */

interface MembersResponse {
  ownerUid: string;
  callerRole: "owner" | MemberRole;
  canManage: boolean;
  members: AccountMember[];
  pendingInvites: AccountInvite[];
}

async function authedFetch(user: User, input: string, init?: RequestInit) {
  const idToken = await user.getIdToken();
  const res = await fetch(input, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
      ...(init?.headers ?? {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

export function ShareWorkspaceDialog({
  user,
  ownerUid,
  open,
  onClose,
}: {
  user: User;
  /** Workspace being shared. Defaults to the caller's own uid. */
  ownerUid: string;
  open: boolean;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [data, setData] = React.useState<MembersResponse | null>(null);

  const [inviteEmail, setInviteEmail] = React.useState("");
  const [inviteRole, setInviteRole] = React.useState<MemberRole>("viewer");
  const [inviting, setInviting] = React.useState(false);
  const [lastAcceptUrl, setLastAcceptUrl] = React.useState<string | null>(null);
  const [busyMember, setBusyMember] = React.useState<string | null>(null);
  const [busyInvite, setBusyInvite] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = (await authedFetch(
        user,
        `/api/account/members?ownerUid=${encodeURIComponent(ownerUid)}`,
      )) as MembersResponse;
      setData(res);
    } catch (e: unknown) {
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [user, ownerUid]);

  React.useEffect(() => {
    if (open) {
      void load();
    }
  }, [open, load]);

  const canManage = data?.canManage ?? false;

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    const email = inviteEmail.trim();
    if (!email) return;
    setInviting(true);
    setLastAcceptUrl(null);
    try {
      const res = await authedFetch(user, "/api/account/invite", {
        method: "POST",
        body: JSON.stringify({ email, role: inviteRole, ownerUid }),
      });
      setInviteEmail("");
      setLastAcceptUrl(res.acceptUrl ?? null);
      toast({
        variant: "success",
        description: res.emailSent
          ? `Invite emailed to ${email}.`
          : `Invite created for ${email}. Copy the accept link to share it.`,
      });
      await load();
    } catch (err: unknown) {
      toast({ variant: "error", description: getErrorMessage(err) });
    } finally {
      setInviting(false);
    }
  }

  async function handleChangeRole(memberUid: string, role: MemberRole) {
    setBusyMember(memberUid);
    try {
      await authedFetch(user, "/api/account/members", {
        method: "PATCH",
        body: JSON.stringify({ ownerUid, memberUid, role }),
      });
      toast({ variant: "success", description: "Role updated." });
      await load();
    } catch (err: unknown) {
      toast({ variant: "error", description: getErrorMessage(err) });
    } finally {
      setBusyMember(null);
    }
  }

  async function handleRemoveMember(memberUid: string) {
    setBusyMember(memberUid);
    try {
      await authedFetch(user, "/api/account/members", {
        method: "DELETE",
        body: JSON.stringify({ ownerUid, memberUid }),
      });
      toast({ variant: "success", description: "Member removed." });
      await load();
    } catch (err: unknown) {
      toast({ variant: "error", description: getErrorMessage(err) });
    } finally {
      setBusyMember(null);
    }
  }

  async function handleRevoke(token: string) {
    setBusyInvite(token);
    try {
      await authedFetch(user, "/api/account/revoke", {
        method: "POST",
        body: JSON.stringify({ ownerUid, token }),
      });
      toast({ variant: "success", description: "Invite revoked." });
      await load();
    } catch (err: unknown) {
      toast({ variant: "error", description: getErrorMessage(err) });
    } finally {
      setBusyInvite(null);
    }
  }

  async function copyAcceptUrl(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      toast({ variant: "success", description: "Accept link copied." });
    } catch {
      toast({ variant: "info", description: "Copy failed — select and copy the link manually." });
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Add a user"
      subtitle="Invite someone by email to view or edit your workspace"
      size="lg"
    >
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-stone-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading members…
        </div>
      ) : error ? (
        <div className="rounded-lg border border-amber-500/40 bg-amber-50 px-3 py-3 text-xs text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
          {error}
          <button
            type="button"
            onClick={() => void load()}
            className="ml-2 font-semibold underline"
          >
            Retry
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Invite form — owner/editor only */}
          {canManage ? (
            <form onSubmit={handleInvite} className="space-y-3">
              <p className="flex items-center gap-1.5 text-xs font-semibold tracking-wider text-stone-500 uppercase">
                <UserPlus className="h-3.5 w-3.5" /> Invite by email
              </p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  type="email"
                  required
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="focus:border-primary-500 w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-xs text-stone-900 placeholder-stone-400 focus:outline-none dark:border-stone-800 dark:bg-stone-950 dark:text-stone-100"
                />
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as MemberRole)}
                  aria-label="Invite role"
                  className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-xs font-semibold text-stone-700 focus:outline-none dark:border-stone-800 dark:bg-stone-950 dark:text-stone-200"
                >
                  <option value="viewer">Read-only</option>
                  <option value="editor">Read &amp; write</option>
                </select>
                <button
                  type="submit"
                  disabled={inviting}
                  className="bg-primary-500 hover:bg-primary-600 inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-white transition disabled:opacity-60"
                >
                  {inviting ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Mail className="h-3.5 w-3.5" />
                  )}
                  Invite
                </button>
              </div>
              {lastAcceptUrl ? (
                <div className="flex items-center gap-2 rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 dark:border-stone-800 dark:bg-stone-950">
                  <code className="min-w-0 flex-1 truncate text-[11px] text-stone-600 dark:text-stone-400">
                    {lastAcceptUrl}
                  </code>
                  <button
                    type="button"
                    onClick={() => copyAcceptUrl(lastAcceptUrl)}
                    className="inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold text-stone-700 hover:underline dark:text-stone-200"
                  >
                    <Copy className="h-3 w-3" /> Copy link
                  </button>
                </div>
              ) : null}
            </form>
          ) : (
            <p className="flex items-center gap-1.5 rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-xs text-stone-500 dark:border-stone-800 dark:bg-stone-950">
              <ShieldCheck className="h-3.5 w-3.5" /> You have view access to this workspace.
            </p>
          )}

          {/* Member list */}
          <div className="space-y-2">
            <p className="text-xs font-semibold tracking-wider text-stone-500 uppercase">Members</p>
            <ul className="divide-y divide-stone-100 rounded-lg border border-stone-200 dark:divide-stone-800 dark:border-stone-800">
              <li className="flex items-center justify-between px-3 py-2.5 text-xs">
                <span className="truncate text-stone-700 dark:text-stone-200">
                  Owner ({data?.ownerUid === user.uid ? "you" : data?.ownerUid})
                </span>
                <span className="shrink-0 rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-semibold text-stone-600 dark:bg-stone-800 dark:text-stone-300">
                  owner
                </span>
              </li>
              {(data?.members ?? []).length === 0 ? (
                <li className="px-3 py-3 text-xs text-stone-400">
                  No one else has access yet. Invite someone above.
                </li>
              ) : (
                (data?.members ?? []).map((m) => (
                  <li
                    key={m.memberUid}
                    className="flex items-center justify-between gap-2 px-3 py-2.5 text-xs"
                  >
                    <span className="min-w-0 truncate text-stone-700 dark:text-stone-200">
                      {m.email}
                    </span>
                    <div className="flex shrink-0 items-center gap-2">
                      {canManage ? (
                        <select
                          value={m.role}
                          disabled={busyMember === m.memberUid}
                          onChange={(e) =>
                            handleChangeRole(m.memberUid, e.target.value as MemberRole)
                          }
                          aria-label={`Role for ${m.email}`}
                          className="rounded-md border border-stone-200 bg-white px-1.5 py-1 text-[11px] font-semibold text-stone-700 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200"
                        >
                          <option value="viewer">viewer</option>
                          <option value="editor">editor</option>
                        </select>
                      ) : (
                        <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-semibold text-stone-600 dark:bg-stone-800 dark:text-stone-300">
                          {m.role}
                        </span>
                      )}
                      {canManage ? (
                        <button
                          type="button"
                          onClick={() => handleRemoveMember(m.memberUid)}
                          disabled={busyMember === m.memberUid}
                          aria-label={`Remove ${m.email}`}
                          className="rounded-md p-1 text-stone-400 transition hover:bg-stone-100 hover:text-red-600 dark:hover:bg-stone-800"
                        >
                          {busyMember === m.memberUid ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" />
                          )}
                        </button>
                      ) : null}
                    </div>
                  </li>
                ))
              )}
            </ul>
          </div>

          {/* Pending invites — owner/editor only */}
          {canManage && (data?.pendingInvites ?? []).length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs font-semibold tracking-wider text-stone-500 uppercase">
                Pending invites
              </p>
              <ul className="divide-y divide-stone-100 rounded-lg border border-stone-200 dark:divide-stone-800 dark:border-stone-800">
                {(data?.pendingInvites ?? []).map((inv) => (
                  <li
                    key={inv.token}
                    className="flex items-center justify-between gap-2 px-3 py-2.5 text-xs"
                  >
                    <span className="min-w-0 truncate text-stone-600 dark:text-stone-300">
                      {inv.email} <span className="text-stone-400">· {inv.role} · pending</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRevoke(inv.token)}
                      disabled={busyInvite === inv.token}
                      className="shrink-0 text-[11px] font-semibold text-stone-500 hover:text-red-600 hover:underline"
                    >
                      {busyInvite === inv.token ? "Revoking…" : "Revoke"}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      )}
    </Dialog>
  );
}
