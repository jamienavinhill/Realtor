"use client";

import * as React from "react";
import type { User } from "firebase/auth";
import type { MemberRole } from "@/types/sharing";

/**
 * Resolve which workspaces the signed-in user can act in (WS18): their OWN workspace
 * (always, as owner) plus every workspace where an owner has accepted them as a member.
 * Drives the workspace switcher and the "whose data am I viewing" resolution.
 *
 * Memberships are resolved server-side (a client cannot run the collectionGroup query
 * across `members`), so this hook calls `GET /api/account/members` with the caller's
 * Firebase ID token and reads the `workspaces` list it returns.
 */
export interface WorkspaceOption {
  ownerUid: string;
  role: "owner" | MemberRole;
  /** Label for the switcher: "Your workspace" for own, else the member email/owner id. */
  label: string;
  isOwn: boolean;
}

export interface WorkspacesApi {
  workspaces: WorkspaceOption[];
  activeOwnerUid: string;
  activeRole: "owner" | MemberRole;
  setActiveOwnerUid: (ownerUid: string) => void;
  ready: boolean;
  reload: () => void;
}

interface MembersApiWorkspace {
  ownerUid: string;
  role: MemberRole;
  email: string;
}

export function useWorkspaces(user: User | null): WorkspacesApi {
  const [workspaces, setWorkspaces] = React.useState<WorkspaceOption[]>([]);
  const [activeOwnerUid, setActiveOwnerUid] = React.useState<string>("");
  const [ready, setReady] = React.useState(false);
  const [nonce, setNonce] = React.useState(0);

  React.useEffect(() => {
    if (!user) {
      setWorkspaces([]);
      setActiveOwnerUid("");
      setReady(false);
      return;
    }

    let cancelled = false;
    const own: WorkspaceOption = {
      ownerUid: user.uid,
      role: "owner",
      label: "Your workspace",
      isOwn: true,
    };
    // Default to own workspace immediately so the UI is usable before the fetch resolves.
    setWorkspaces([own]);
    setActiveOwnerUid((current) => current || user.uid);

    (async () => {
      try {
        const idToken = await user.getIdToken();
        const res = await fetch("/api/account/members", {
          headers: { Authorization: `Bearer ${idToken}` },
        });
        if (!res.ok) throw new Error(`members ${res.status}`);
        const data = (await res.json()) as { workspaces?: MembersApiWorkspace[] };
        if (cancelled) return;
        const memberOf: WorkspaceOption[] = (data.workspaces ?? []).map((w) => ({
          ownerUid: w.ownerUid,
          role: w.role,
          label: `${w.email}'s workspace`,
          isOwn: false,
        }));
        setWorkspaces([own, ...memberOf]);
      } catch {
        // Keep the own-workspace default; membership resolution is best-effort.
        if (!cancelled) setWorkspaces([own]);
      } finally {
        if (!cancelled) setReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, nonce]);

  const activeRole = workspaces.find((w) => w.ownerUid === activeOwnerUid)?.role ?? "owner";

  const reload = React.useCallback(() => setNonce((n) => n + 1), []);

  return { workspaces, activeOwnerUid, activeRole, setActiveOwnerUid, ready, reload };
}
