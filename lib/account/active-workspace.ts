import type { MemberRole } from "@/types/sharing";

/**
 * Pure helpers that resolve "which workspace am I acting in, and may I write it?" for the
 * dashboard client (WS18 pass 2). Kept free of React/Firestore so the targeting logic is
 * unit-testable in isolation; the dashboard and `useListingPreferences` consume these.
 *
 * The active workspace is the owner whose `users/{ownerUid}/...`, `alerts`, and
 * `alert_matches` the client reads/writes. It defaults to the signed-in user's own uid and
 * becomes a different owner only when the user has switched to a workspace they are a
 * member of. Writes are permitted for the owner and editors; viewers are read-only (the
 * Firestore rules are the authoritative gate — this just drives honest, non-misleading UI).
 */

export type ActiveRole = "owner" | MemberRole;

/**
 * Resolve the active workspace owner uid. Falls back to the user's own uid whenever no
 * selection has been made yet, and returns "" when signed out so listeners stay idle.
 */
export function resolveActiveOwnerUid(
  ownUid: string | null | undefined,
  selectedOwnerUid: string | null | undefined,
): string {
  if (!ownUid) {
    return "";
  }
  return selectedOwnerUid || ownUid;
}

/** Whether the active role may mutate the workspace (owner/editor true, viewer false). */
export function canWriteWorkspace(role: ActiveRole): boolean {
  return role !== "viewer";
}

/** Whether the active workspace belongs to someone other than the signed-in user. */
export function isViewingOtherWorkspace(
  ownUid: string | null | undefined,
  activeOwnerUid: string,
): boolean {
  return Boolean(ownUid && activeOwnerUid && activeOwnerUid !== ownUid);
}
