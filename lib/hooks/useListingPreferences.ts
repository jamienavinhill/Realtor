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
 * queue. These collections are owner-scoped and `firestore.rules` already permits
 * the owner to read/write them directly, so — exactly like `alerts` in the
 * dashboard — the client SDK is the correct, server-route-free path. The Admin SDK
 * repository (`lib/repositories/listing-preferences.ts`) remains the server lane
 * for non-browser writers; this hook never touches it.
 *
 * Writes are validated against the same shape the rules enforce. The compare cap
 * is enforced here too (and again by rules) so the UI can surface a clear toast.
 */
export interface ListingPreferencesApi {
  /** Map of listingId -> current state for the signed-in user. */
  states: Record<string, ListingUserState>;
  /** Ordered list of listingIds queued for comparison (max MAX_COMPARE_LISTINGS). */
  compareIds: string[];
  ready: boolean;
  /** Set or toggle a preference state. Passing the current state clears it. */
  setState: (listingId: string, state: ListingUserState) => Promise<void>;
  clearState: (listingId: string) => Promise<void>;
  /** Add to the compare queue. Returns false if the queue is already full. */
  addToCompare: (listingId: string) => Promise<boolean>;
  removeFromCompare: (listingId: string) => Promise<void>;
  clearCompare: () => Promise<void>;
}

function prefDocPath(uid: string, listingId: string) {
  return doc(db, "users", uid, "listingPreferences", listingId);
}

function compareDocPath(uid: string) {
  return doc(db, "users", uid, "compareQueue", COMPARE_QUEUE_DOC_ID);
}

export function useListingPreferences(user: User | null): ListingPreferencesApi {
  const [states, setStates] = React.useState<Record<string, ListingUserState>>({});
  const [compareIds, setCompareIds] = React.useState<string[]>([]);
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    if (!user) {
      setStates({});
      setCompareIds([]);
      setReady(false);
      return;
    }

    const uid = user.uid;
    let prefsLoaded = false;
    let compareLoaded = false;
    const markReady = () => {
      if (prefsLoaded && compareLoaded) setReady(true);
    };

    const unsubPrefs = onSnapshot(
      collection(db, "users", uid, "listingPreferences"),
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
        console.error("listingPreferences snapshot error:", err);
        prefsLoaded = true;
        markReady();
      },
    );

    const unsubCompare = onSnapshot(
      compareDocPath(uid),
      (snapshot) => {
        const data = snapshot.data() as { listingIds?: string[] } | undefined;
        setCompareIds(Array.isArray(data?.listingIds) ? data.listingIds : []);
        compareLoaded = true;
        markReady();
      },
      (err) => {
        console.error("compareQueue snapshot error:", err);
        compareLoaded = true;
        markReady();
      },
    );

    return () => {
      unsubPrefs();
      unsubCompare();
    };
  }, [user]);

  const setState = React.useCallback(
    async (listingId: string, state: ListingUserState) => {
      if (!user) throw new Error("Sign in to save listing preferences.");
      // Toggling the same state clears it (a second "Favorite" un-favorites).
      if (states[listingId] === state) {
        await deleteDoc(prefDocPath(user.uid, listingId));
        return;
      }
      const now = new Date().toISOString();
      const existingCreatedAt = states[listingId] ? undefined : now;
      await setDoc(
        prefDocPath(user.uid, listingId),
        {
          listingId,
          userId: user.uid,
          state,
          createdAt: existingCreatedAt ?? now,
          updatedAt: now,
        },
        { merge: true },
      );
    },
    [user, states],
  );

  const clearState = React.useCallback(
    async (listingId: string) => {
      if (!user) throw new Error("Sign in to save listing preferences.");
      await deleteDoc(prefDocPath(user.uid, listingId));
    },
    [user],
  );

  const writeCompare = React.useCallback(async (uid: string, listingIds: string[]) => {
    await setDoc(compareDocPath(uid), {
      userId: uid,
      listingIds,
      updatedAt: new Date().toISOString(),
    });
  }, []);

  const addToCompare = React.useCallback(
    async (listingId: string) => {
      if (!user) throw new Error("Sign in to compare listings.");
      if (compareIds.includes(listingId)) return true;
      if (compareIds.length >= MAX_COMPARE_LISTINGS) return false;
      await writeCompare(user.uid, [...compareIds, listingId]);
      return true;
    },
    [user, compareIds, writeCompare],
  );

  const removeFromCompare = React.useCallback(
    async (listingId: string) => {
      if (!user) throw new Error("Sign in to compare listings.");
      await writeCompare(
        user.uid,
        compareIds.filter((id) => id !== listingId),
      );
    },
    [user, compareIds, writeCompare],
  );

  const clearCompare = React.useCallback(async () => {
    if (!user) throw new Error("Sign in to compare listings.");
    await writeCompare(user.uid, []);
  }, [user, writeCompare]);

  return {
    states,
    compareIds,
    ready,
    setState,
    clearState,
    addToCompare,
    removeFromCompare,
    clearCompare,
  };
}
