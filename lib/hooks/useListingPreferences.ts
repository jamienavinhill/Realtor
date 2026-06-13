"use client";

import * as React from "react";
import type { User } from "firebase/auth";
import { collection, deleteDoc, doc, onSnapshot, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  COMPARE_QUEUE_DOC_ID,
  MAX_COMPARE_LISTINGS,
  type ListingUserPreference,
  type ListingUserState,
} from "@/types/listings";

/**
 * Client hook for per-user listing preferences (WS4 contract) and the compare
 * queue, scoped to the ACTIVE WORKSPACE owner (WS18). These collections live under
 * `users/{ownerUid}/...` and `config/firebase/firestore.rules` resolves access by
 * membership: the owner and any member may READ; the owner and editors may WRITE
 * (the stored `userId` is pinned to the workspace owner, not the writer). So — exactly
 * like `alerts` in the dashboard — the client SDK is the correct, server-route-free path.
 *
 * `ownerUid` defaults to the signed-in user's own uid (their own workspace). When the
 * user switches to a workspace they are a member of, the dashboard passes that owner's
 * uid and the hook reads/writes THAT owner's subcollections. `canWrite` is false for a
 * viewer: mutations short-circuit with a clear error and the UI hides the controls (the
 * rules deny the write regardless, so this is defense-in-depth + an honest UX, not the
 * only gate).
 *
 * The Admin SDK repository (`lib/repositories/listing-preferences.ts`) remains the server
 * lane for non-browser writers; this hook never touches it.
 *
 * Writes are validated against the same shape the rules enforce. The compare cap
 * is enforced here too (and again by rules) so the UI can surface a clear toast.
 */
export interface ListingPreferencesApi {
  /** Map of listingId -> current state for the active workspace. */
  states: Record<string, ListingUserState>;
  /** Ordered list of listingIds queued for comparison (max MAX_COMPARE_LISTINGS). */
  compareIds: string[];
  ready: boolean;
  /** Whether the active member may mutate (owner/editor true, viewer false). */
  canWrite: boolean;
  /** Set or toggle a preference state. Passing the current state clears it. */
  setState: (listingId: string, state: ListingUserState) => Promise<void>;
  clearState: (listingId: string) => Promise<void>;
  /** Add to the compare queue. Returns false if the queue is already full. */
  addToCompare: (listingId: string) => Promise<boolean>;
  removeFromCompare: (listingId: string) => Promise<void>;
  clearCompare: () => Promise<void>;
}

function prefDocPath(ownerUid: string, listingId: string) {
  return doc(db, "users", ownerUid, "listingPreferences", listingId);
}

function compareDocPath(ownerUid: string) {
  return doc(db, "users", ownerUid, "compareQueue", COMPARE_QUEUE_DOC_ID);
}

const READ_ONLY_ERROR = "You have view-only access to this workspace.";

export interface UseListingPreferencesOptions {
  /** Workspace whose preferences to read/write. Defaults to the user's own uid. */
  ownerUid?: string;
  /** Whether the active role may write (owner/editor). Viewers get read-only. */
  canWrite?: boolean;
}

export function useListingPreferences(
  user: User | null,
  options: UseListingPreferencesOptions = {},
): ListingPreferencesApi {
  const [states, setStates] = React.useState<Record<string, ListingUserState>>({});
  const [compareIds, setCompareIds] = React.useState<string[]>([]);
  const [ready, setReady] = React.useState(false);

  // The workspace we read/write. Defaults to the signed-in user's own workspace.
  const ownerUid = options.ownerUid || user?.uid || "";
  const canWrite = options.canWrite ?? true;

  React.useEffect(() => {
    if (!user || !ownerUid) {
      setStates({});
      setCompareIds([]);
      setReady(false);
      return;
    }

    // Switching workspaces resets the view until the new owner's data loads, so stale
    // data from the previous workspace is never shown.
    setStates({});
    setCompareIds([]);
    setReady(false);

    let prefsLoaded = false;
    let compareLoaded = false;
    const markReady = () => {
      if (prefsLoaded && compareLoaded) setReady(true);
    };

    const unsubPrefs = onSnapshot(
      collection(db, "users", ownerUid, "listingPreferences"),
      (snapshot) => {
        const next: Record<string, ListingUserState> = {};
        snapshot.forEach((d) => {
          const data = d.data() as Partial<ListingUserPreference>;
          if (data.state) {
            next[d.id] = data.state;
          }
        });
        setStates(next);
        prefsLoaded = true;
        markReady();
      },
      (err) => {
        // Snapshot error: mark ready without console (AC5: no console in client UI)
        prefsLoaded = true;
        markReady();
      },
    );

    const unsubCompare = onSnapshot(
      compareDocPath(ownerUid),
      (snapshot) => {
        const data = snapshot.data() as { listingIds?: string[] } | undefined;
        setCompareIds(Array.isArray(data?.listingIds) ? data.listingIds : []);
        compareLoaded = true;
        markReady();
      },
      (err) => {
        // Snapshot error (client UI): silent per AC5 no console in client hooks
        compareLoaded = true;
        markReady();
      },
    );

    return () => {
      unsubPrefs();
      unsubCompare();
    };
  }, [user, ownerUid]);

  const setState = React.useCallback(
    async (listingId: string, state: ListingUserState) => {
      if (!user) throw new Error("Sign in to save listing preferences.");
      if (!canWrite) throw new Error(READ_ONLY_ERROR);
      // Toggling the same state clears it (a second "Favorite" un-favorites).
      if (states[listingId] === state) {
        await deleteDoc(prefDocPath(ownerUid, listingId));
        return;
      }
      const now = new Date().toISOString();
      // On an existing doc we merge and omit `createdAt` so the original creation
      // time is preserved (Firestore merge keeps untouched fields; the rules see
      // the merged resource, which still carries the original `createdAt`). Only a
      // brand-new doc sets `createdAt`. The stored `userId` is the WORKSPACE owner's
      // uid (owner-pinned), so an editor's write stays scoped to the owner.
      const isNew = !states[listingId];
      await setDoc(
        prefDocPath(ownerUid, listingId),
        {
          listingId,
          userId: ownerUid,
          state,
          updatedAt: now,
          ...(isNew ? { createdAt: now } : {}),
        },
        { merge: true },
      );
    },
    [user, ownerUid, canWrite, states],
  );

  const clearState = React.useCallback(
    async (listingId: string) => {
      if (!user) throw new Error("Sign in to save listing preferences.");
      if (!canWrite) throw new Error(READ_ONLY_ERROR);
      await deleteDoc(prefDocPath(ownerUid, listingId));
    },
    [user, ownerUid, canWrite],
  );

  const writeCompare = React.useCallback(
    async (listingIds: string[]) => {
      await setDoc(compareDocPath(ownerUid), {
        userId: ownerUid,
        listingIds,
        updatedAt: new Date().toISOString(),
      });
    },
    [ownerUid],
  );

  const addToCompare = React.useCallback(
    async (listingId: string) => {
      if (!user) throw new Error("Sign in to compare listings.");
      if (!canWrite) throw new Error(READ_ONLY_ERROR);
      if (compareIds.includes(listingId)) return true;
      if (compareIds.length >= MAX_COMPARE_LISTINGS) return false;
      await writeCompare([...compareIds, listingId]);
      return true;
    },
    [user, canWrite, compareIds, writeCompare],
  );

  const removeFromCompare = React.useCallback(
    async (listingId: string) => {
      if (!user) throw new Error("Sign in to compare listings.");
      if (!canWrite) throw new Error(READ_ONLY_ERROR);
      await writeCompare(compareIds.filter((id) => id !== listingId));
    },
    [user, canWrite, compareIds, writeCompare],
  );

  const clearCompare = React.useCallback(async () => {
    if (!user) throw new Error("Sign in to compare listings.");
    if (!canWrite) throw new Error(READ_ONLY_ERROR);
    await writeCompare([]);
  }, [user, canWrite, writeCompare]);

  return {
    states,
    compareIds,
    ready,
    canWrite,
    setState,
    clearState,
    addToCompare,
    removeFromCompare,
    clearCompare,
  };
}
