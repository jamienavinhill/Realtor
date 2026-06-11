"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Bell,
  Building2,
  Cloud,
  FileText,
  Loader2,
  LogOut,
  Mail,
  PlusCircle,
  Search,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Users,
} from "lucide-react";
import { collection, deleteDoc, doc, onSnapshot, query, setDoc, where } from "firebase/firestore";
import {
  auth,
  db,
  googleProvider,
  signInWithPopup,
  signOut,
  handleFirestoreError,
  OperationType,
} from "../lib/firebase";
import { onAuthStateChanged, User, GoogleAuthProvider, signInWithCredential } from "firebase/auth";

import { getErrorMessage } from "../lib/errors";
import {
  initSignIn,
  isSignInReady,
  requestOfflineAuthCode,
  SIGNIN_SCOPES,
} from "../lib/gmail/gis-client";
import { DASHBOARD_TABS, type DashboardTab } from "../types/dashboard";
import {
  AlertMatch,
  ListingProperty,
  type ListingUserState,
  MAX_COMPARE_LISTINGS,
  PropertyAlert,
} from "../types/listings";
import { BASELINE_ZIP, DEFAULT_ALERT_CITY } from "@/lib/ingest/constants";
import { composeGmailQuery, DEFAULT_PLATFORM_SELECTION } from "@/lib/gmail/platforms";
import { DocsView } from "./views/DocsView";
import { AlertsWizardView } from "./views/AlertsWizardView";
import { IngestPlatformSelector } from "./views/IngestPlatformSelector";
import { ListingsGrid, NoListingMedia } from "./views/ListingsGrid";
import { CompareDialog } from "./views/CompareDialog";
import { CMAView } from "./views/CMAView";
import { ThemeControls } from "./theme-controls";
import { useToast } from "./ui/toast";
import { useListingPreferences } from "@/lib/hooks/useListingPreferences";
import { useWorkspaces } from "@/lib/hooks/useWorkspaces";
import { resolveActiveOwnerUid, canWriteWorkspace } from "@/lib/account/active-workspace";
import { ShareWorkspaceDialog } from "./sharing/ShareWorkspaceDialog";
import { filterListings } from "@/lib/listings/filter";
import { Eye, EyeOff, GitCompareArrows, Heart } from "lucide-react";

// Request Google Workspace granular scopes
googleProvider.addScope("https://www.googleapis.com/auth/gmail.readonly");
googleProvider.addScope("https://www.googleapis.com/auth/spreadsheets");
googleProvider.addScope("https://www.googleapis.com/auth/calendar");
googleProvider.addScope("https://www.googleapis.com/auth/drive.file");

function GoogleGlyph() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.84z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06L5.84 9.9C6.71 7.3 9.14 5.38 12 5.38z"
      />
    </svg>
  );
}

function GoogleSignInButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-stone-300 bg-white px-4 py-2 text-xs font-semibold text-stone-700 shadow-sm transition hover:bg-stone-50 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100 dark:hover:bg-stone-900"
    >
      <GoogleGlyph />
      <span>Sign in</span>
    </button>
  );
}

function UserAvatar({ user }: { user: User }) {
  const label = user.displayName || user.email || "Google account";

  if (user.photoURL) {
    return (
      <img
        src={user.photoURL}
        alt=""
        referrerPolicy="no-referrer"
        className="h-9 w-9 rounded-full border border-stone-200 bg-white object-cover shadow-sm dark:border-stone-700"
      />
    );
  }

  return (
    <div className="bg-primary-500 flex h-9 w-9 items-center justify-center rounded-full border border-stone-200 text-xs font-bold text-white shadow-sm dark:border-stone-700">
      {label.slice(0, 1).toUpperCase()}
    </div>
  );
}

function FilterToggle({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-xs font-semibold transition ${
        active
          ? "border-primary-500 bg-primary-500/10 text-primary-600 dark:text-primary-400"
          : "border-stone-200 bg-stone-50 text-stone-500 hover:text-stone-900 dark:border-stone-800 dark:bg-stone-950 dark:hover:text-stone-200"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function ProfileMenu({
  user,
  onSignOut,
  onShareWorkspace,
}: {
  user: User;
  onSignOut: () => void;
  onShareWorkspace: () => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const name = user.displayName || user.email || "Google account";

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="focus-visible:ring-primary-500 flex cursor-pointer items-center rounded-full transition focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-stone-950"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Open profile menu"
      >
        <UserAvatar user={user} />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Profile"
          className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-xl border border-stone-200 bg-white shadow-lg dark:border-stone-800 dark:bg-stone-900"
        >
          <div className="border-b border-stone-100 px-4 py-3 dark:border-stone-800">
            <p className="truncate text-sm font-semibold text-stone-900 dark:text-stone-100">
              {name}
            </p>
            {user.email && user.displayName ? (
              <p className="truncate text-xs text-stone-500 dark:text-stone-400">{user.email}</p>
            ) : null}
          </div>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onShareWorkspace();
            }}
            className="flex w-full cursor-pointer items-center gap-2 px-4 py-2.5 text-left text-sm text-stone-700 transition hover:bg-stone-100 dark:text-stone-200 dark:hover:bg-stone-800"
          >
            <Users className="h-4 w-4" />
            <span>Add user</span>
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onSignOut();
            }}
            className="flex w-full cursor-pointer items-center gap-2 border-t border-stone-100 px-4 py-2.5 text-left text-sm text-stone-700 transition hover:bg-stone-100 dark:border-stone-800 dark:text-stone-200 dark:hover:bg-stone-800"
          >
            <LogOut className="h-4 w-4" />
            <span>Sign out</span>
          </button>
          <div className="flex items-center gap-2 border-t border-stone-100 px-4 py-2 text-xs text-stone-400 dark:border-stone-800 dark:text-stone-500">
            <Link
              href="/privacy"
              className="transition hover:text-stone-600 hover:underline dark:hover:text-stone-300"
            >
              Privacy
            </Link>
            <span aria-hidden="true">·</span>
            <Link
              href="/terms"
              className="transition hover:text-stone-600 hover:underline dark:hover:text-stone-300"
            >
              Terms
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Dashboard() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [accessToken, setAccessToken] = useState<string | null>(null);

  const [properties, setProperties] = useState<ListingProperty[]>([]);
  const [alerts, setAlerts] = useState<PropertyAlert[]>([]);
  const [alertMatches, setAlertMatches] = useState<AlertMatch[]>([]);
  const [activeTab, setActiveTab] = useState<DashboardTab>("listings");

  // Filtering & Search state
  const [searchTerm, setSearchTerm] = useState("");
  const [cityFilter, setCityFilter] = useState("All");
  // WS12 per-user view toggles: hidden listings are excluded from the default grid
  // but recoverable via "Show hidden"; "Favorites only" narrows to favorited listings.
  const [showHidden, setShowHidden] = useState(false);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);

  // Alert form state
  const [newAlertName, setNewAlertName] = useState("");
  const [newAlertCity, setNewAlertCity] = useState(DEFAULT_ALERT_CITY);
  const [newAlertMaxPrice, setNewAlertMaxPrice] = useState("");
  const [newAlertMinBeds, setNewAlertMinBeds] = useState("2");

  // Gmail Harvester controls — platform multiselect (WS7) replaces the raw query field.
  const [platformSelection, setPlatformSelection] = useState<string[]>(DEFAULT_PLATFORM_SELECTION);
  const [customQuery, setCustomQuery] = useState("");
  const [gmailMaxResults, setGmailMaxResults] = useState(5);
  const [isScanningGmail, setIsScanningGmail] = useState(false);
  const [isSavingFilter, setIsSavingFilter] = useState(false);
  const [showAdvancedScan, setShowAdvancedScan] = useState(false);
  const [harvestedPreviews, setHarvestedPreviews] = useState<ListingProperty[]>([]);

  const composedGmailQuery = composeGmailQuery({ platformIds: platformSelection, customQuery });

  // Direct Text Parser controls
  const [directPastedText, setDirectPastedText] = useState("");
  const [isParsingDirect, setIsParsingDirect] = useState(false);

  // Workspace integration loading states for specific property cards
  const [sheetsExportingPropId, setSheetsExportingPropId] = useState<string | null>(null);
  const [sheetLink, setSheetLink] = useState<{ id: string; url: string } | null>(null);
  const [calendarSchedulingPropId, setCalendarSchedulingPropId] = useState<string | null>(null);
  const [calendarEventTime, setCalendarEventTime] = useState<string>("");

  const { toast } = useToast();

  // Account sharing (WS18): which workspaces this user can act in + the share dialog.
  const workspacesApi = useWorkspaces(user);
  const [shareOpen, setShareOpen] = useState(false);

  // The workspace the dashboard is currently reading/writing. Defaults to the user's own
  // uid; when the user switches to a workspace they're a member of, every per-user listener
  // and write below re-targets THAT owner's subcollections (WS18 pass 2). A viewer is
  // read-only (canWrite false): mutating controls are hidden and the rules deny the write.
  const activeOwnerUid = resolveActiveOwnerUid(user?.uid, workspacesApi.activeOwnerUid);
  const canWrite = canWriteWorkspace(workspacesApi.activeRole);

  // Per-user listing preferences + compare queue (WS4 contract), scoped to the active
  // workspace owner and gated by the active role (WS18).
  const prefs = useListingPreferences(user, { ownerUid: activeOwnerUid, canWrite });

  // Wrap the prefs API with toast feedback (and the compare-cap toast) for the grid/dialog.
  // Filtering reads `prefs` directly; only user-initiated writes route through here.
  const STATE_LABELS: Record<ListingUserState, string> = {
    interested: "Marked interested",
    notInterested: "Marked not interested",
    favorite: "Added to favorites",
    hidden: "Listing hidden",
  };
  const gridPrefs: typeof prefs = {
    ...prefs,
    setState: async (listingId, state) => {
      try {
        const wasActive = prefs.states[listingId] === state;
        await prefs.setState(listingId, state);
        toast({
          variant: "success",
          description: wasActive ? "Preference cleared" : STATE_LABELS[state],
        });
      } catch (error: unknown) {
        toast({ variant: "error", description: getErrorMessage(error) });
        throw error;
      }
    },
    addToCompare: async (listingId) => {
      try {
        const added = await prefs.addToCompare(listingId);
        if (added) {
          toast({ variant: "success", description: "Added to comparison" });
        } else {
          toast({
            variant: "info",
            description: `Compare holds at most ${MAX_COMPARE_LISTINGS} listings. Remove one to add another.`,
          });
        }
        return added;
      } catch (error: unknown) {
        toast({ variant: "error", description: getErrorMessage(error) });
        throw error;
      }
    },
  };

  // Run Gemini-backed analysis for a listing via the protected server route.
  // Returns the analysis text; throws (with a toast) on failure so the dialog can reset.
  const analyzeListing = async (property: ListingProperty): Promise<string> => {
    if (!user) {
      toast({ variant: "error", description: "Sign in to analyze a listing." });
      throw new Error("not signed in");
    }
    try {
      const idToken = await user.getIdToken();
      const response = await fetch("/api/listings/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          listing: {
            id: property.id,
            title: property.title,
            address: property.address,
            city: property.city,
            state: property.state,
            zipCode: property.zipCode,
            price: property.price,
            beds: property.beds,
            baths: property.baths,
            sqft: property.sqft,
            propertyType: property.propertyType,
            status: property.status,
            yearBuilt: property.yearBuilt,
            description: property.description,
            distanceMiles: property.distanceMiles,
            enrichmentNeighborhood: property.enrichment?.neighborhood,
          },
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Analysis failed.");
      }
      return data.analysis as string;
    } catch (error: unknown) {
      toast({ variant: "error", description: `Analysis failed: ${getErrorMessage(error)}` });
      throw error;
    }
  };

  // Load and listen to Auth state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Listen to Firestore properties and alerts
  useEffect(() => {
    if (authLoading) return;

    let unsubProperties = () => {};
    let unsubAlerts = () => {};
    let unsubAlertMatches = () => {};

    // 1. Properties snapshot listener
    try {
      const qProperties = collection(db, "properties");
      unsubProperties = onSnapshot(
        qProperties,
        (snapshot) => {
          const props: ListingProperty[] = [];
          snapshot.forEach((doc) => {
            props.push({ id: doc.id, ...doc.data() } as ListingProperty);
          });

          props.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
          setProperties(props);
        },
        (err) => {
          console.error("Firestore onSnapshot properties error:", err);
        },
      );
    } catch (e) {
      console.error(e);
      setProperties([]);
    }

    // 2. Alerts snapshot listener — scoped to the ACTIVE workspace owner (WS18), so a
    //    member viewing the owner's workspace sees the owner's alerts/matches, not their own.
    if (user && activeOwnerUid) {
      try {
        const qAlerts = query(collection(db, "alerts"), where("userId", "==", activeOwnerUid));
        unsubAlerts = onSnapshot(
          qAlerts,
          (snapshot) => {
            const loadedAlerts: PropertyAlert[] = [];
            snapshot.forEach((doc) => {
              loadedAlerts.push({ id: doc.id, ...doc.data() } as PropertyAlert);
            });
            setAlerts(loadedAlerts);
          },
          (err) => {
            console.error("Firestore onSnapshot alerts error:", err);
          },
        );
      } catch (e) {
        console.error(e);
      }
      try {
        const qAlertMatches = query(
          collection(db, "alert_matches"),
          where("userId", "==", activeOwnerUid),
        );
        unsubAlertMatches = onSnapshot(
          qAlertMatches,
          (snapshot) => {
            const loadedMatches: AlertMatch[] = [];
            snapshot.forEach((doc) => {
              loadedMatches.push({ id: doc.id, ...doc.data() } as AlertMatch);
            });
            loadedMatches.sort(
              (a, b) => new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime(),
            );
            setAlertMatches(loadedMatches);
          },
          (err) => {
            console.error("Firestore onSnapshot alert_matches error:", err);
          },
        );
      } catch (e) {
        console.error(e);
        setAlertMatches([]);
      }
    } else {
      setAlerts([]);
      setAlertMatches([]);
    }

    return () => {
      unsubProperties();
      unsubAlerts();
      unsubAlertMatches();
    };
  }, [user, authLoading, activeOwnerUid]);

  // Build the offline sign-in client on mount so the consent popup opens in-gesture on click.
  useEffect(() => {
    initSignIn(process.env.NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID ?? "", SIGNIN_SCOPES);
  }, []);

  // Sign in with Google using the OFFLINE auth-code flow so ONE consent covers everything
  // (identity + Gmail read/send + Workspace) and yields a stored refresh token — no more
  // re-authorizing each session. If the offline client isn't ready or the flow errors, fall
  // back to the proven Firebase popup so sign-in can never fully break.
  const handleGoogleAuth = async () => {
    const popupSignIn = async () => {
      const result = await signInWithPopup(auth, googleProvider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (credential?.accessToken) setAccessToken(credential.accessToken);
      toast({ variant: "success", description: "Signed in." });
    };

    if (!isSignInReady()) {
      try {
        await popupSignIn();
      } catch (e: unknown) {
        toast({ variant: "error", description: `Sign-in failed: ${getErrorMessage(e)}` });
      }
      return;
    }

    try {
      const code = await requestOfflineAuthCode();
      const res = await fetch("/api/auth/google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.idToken) {
        throw new Error(data.error || `Sign-in exchange failed (${res.status})`);
      }
      const credential = GoogleAuthProvider.credential(data.idToken);
      const result = await signInWithCredential(auth, credential);
      if (data.accessToken) setAccessToken(data.accessToken);
      // Move the stored refresh token under this uid (set-and-forget Gmail). Best-effort.
      try {
        const fbIdToken = await result.user.getIdToken();
        await fetch("/api/gmail/claim", {
          method: "POST",
          headers: { Authorization: `Bearer ${fbIdToken}` },
        });
      } catch {
        /* claim is best-effort; sign-in already succeeded */
      }
      toast({ variant: "success", description: "Signed in. Google connected." });
    } catch (error: unknown) {
      console.error("Offline sign-in failed; falling back to popup:", error);
      try {
        await popupSignIn();
      } catch (e: unknown) {
        toast({ variant: "error", description: `Sign-in failed: ${getErrorMessage(e)}` });
      }
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setAccessToken(null);
      toast({ variant: "info", description: "Signed out of services." });
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  // Harvest real estate alert updates from real Gmail
  const triggerGmailHarvest = async () => {
    if (!user || !accessToken) {
      toast({
        variant: "error",
        description:
          "Active Google Workspace token required. Use 'Authorize Google Services' on the Ingest tab.",
      });
      return;
    }
    setIsScanningGmail(true);
    setHarvestedPreviews([]);

    try {
      // The Gmail scan needs BOTH tokens: the Google OAuth access token (Authorization,
      // for the Gmail REST API) AND a Firebase ID token (X-Firebase-Id-Token) so the
      // server verifies the caller before driving billable Gemini extraction (WS16).
      const idToken = await user.getIdToken();
      const response = await fetch("/api/properties", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
          "X-Firebase-Id-Token": idToken,
        },
        body: JSON.stringify({
          action: "parse_gmail",
          query: composedGmailQuery,
          maxResults: gmailMaxResults,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to parse matching email listings.");
      }

      setHarvestedPreviews(data.properties || []);
      toast({
        variant: "success",
        description: `Harvest complete: found ${data.properties?.length || 0} matching listing(s) in Gmail.`,
      });
    } catch (error: unknown) {
      console.error(error);
      toast({ variant: "error", description: `Gmail harvester error: ${getErrorMessage(error)}` });
    } finally {
      setIsScanningGmail(false);
    }
  };

  // Persist the platform multiselect + custom query server-side (users/{uid}/gmailSync).
  // Uses the Firebase ID token; the server derives the uid and never trusts a client uid.
  const persistPlatformSelection = async () => {
    if (!user) {
      toast({ variant: "error", description: "Sign in to save your platform filter." });
      return;
    }
    setIsSavingFilter(true);
    try {
      const idToken = await user.getIdToken();
      const response = await fetch("/api/gmail/connect", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          emailAddress: user.email ?? undefined,
          platformSelection,
          customQuery,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to save platform filter.");
      }
      toast({ variant: "success", description: "Saved your listing-platform filter." });
    } catch (error: unknown) {
      console.error(error);
      toast({ variant: "error", description: `Could not save filter: ${getErrorMessage(error)}` });
    } finally {
      setIsSavingFilter(false);
    }
  };

  // Submit direct raw email text or copy-pasted webpage alerts to Gemini
  const triggerDirectTextParse = async () => {
    if (!directPastedText.trim()) {
      toast({ variant: "info", description: "Please paste listing details first." });
      return;
    }
    // WS16: raw-text parsing drives billable Gemini extraction, so it now requires a
    // verified Firebase ID token. Honest signed-out state instead of an unauthenticated
    // call that the server would reject with a 401.
    if (!user) {
      toast({ variant: "error", description: "Sign in to parse listing text." });
      return;
    }
    setIsParsingDirect(true);

    try {
      const idToken = await user.getIdToken();
      const response = await fetch("/api/properties", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          action: "parse_raw_text",
          text: directPastedText,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to analyze pasting.");
      }

      if (data.property) {
        setHarvestedPreviews([data.property]);
        toast({
          variant: "success",
          description: "Listing structured. Review below and commit to the database.",
        });
      } else {
        toast({
          variant: "info",
          description: "No recognizable property details were found in that text.",
        });
      }
    } catch (error: unknown) {
      console.error(error);
      toast({ variant: "error", description: `Parser error: ${getErrorMessage(error)}` });
    } finally {
      setIsParsingDirect(false);
    }
  };

  // Commit Harvested/Parsed Listings to the shared catalog (WS16).
  //
  // The browser no longer writes `properties/*` directly — Firestore rules deny client
  // writes to the shared catalog. Instead the reviewed listings POST to /api/properties
  // (action `commit`) with the user's Firebase ID token; the server re-validates,
  // provenances, and writes them via the Admin SDK. The local alert evaluation still runs
  // against the server-normalized listings the route returns.
  const commitListingsToFirestore = async () => {
    if (!user || harvestedPreviews.length === 0) return;

    try {
      const idToken = await user.getIdToken();
      // Listings carrying an emailSource came from the Gmail scan lane; everything else is
      // a pasted/structured listing. This only sets provenance — the server re-validates.
      const origin = harvestedPreviews.some((p) => "emailSource" in p)
        ? "manual_gmail"
        : "manual_paste";

      const response = await fetch("/api/properties", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          action: "commit",
          origin,
          listings: harvestedPreviews,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to commit listings.");
      }

      const committed: ListingProperty[] = data.properties || [];
      // Evaluate alerts against the server-normalized listings (with stored provenance).
      committed.forEach((prop) => checkForAlertMatch(prop));

      const rejectedCount: number = data.rejectedCount || 0;
      toast({
        variant: rejectedCount > 0 ? "info" : "success",
        description:
          rejectedCount > 0
            ? `Saved ${data.committedCount} listing(s); ${rejectedCount} were rejected as invalid.`
            : `Saved ${data.committedCount} listing(s). Alert pipelines evaluated.`,
      });
      setHarvestedPreviews([]);
      setActiveTab("listings");
    } catch (err: unknown) {
      toast({ variant: "error", description: `Commit halted: ${getErrorMessage(err)}` });
    }
  };

  // Exports specific property data straight to user's Google Sheet
  const exportListingToGoogleSheet = async (prop: ListingProperty) => {
    if (!accessToken) {
      toast({
        variant: "error",
        description: "Google Workspace token expired or offline. Sign in first.",
      });
      return;
    }

    setSheetsExportingPropId(prop.id);

    try {
      const response = await fetch("/api/properties", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          action: "export_sheets",
          spreadsheetId: sheetLink?.id || undefined, // Create new or append to existing
          listings: [prop],
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to log record on sheets.");
      }

      setSheetLink({ id: data.spreadsheetId, url: data.url });
      toast({
        variant: "success",
        description: "Listing logged to Google Sheets.",
        action: { label: "Open sheet", onClick: () => window.open(data.url, "_blank") },
      });
    } catch (err: unknown) {
      console.error(err);
      toast({ variant: "error", description: `Sheets integration error: ${getErrorMessage(err)}` });
    } finally {
      setSheetsExportingPropId(null);
    }
  };

  // Schedules viewing appointment / tour automatically into Google Calendar
  const bookCalendarViewingEvent = async (prop: ListingProperty) => {
    if (!accessToken) {
      toast({
        variant: "error",
        description: "Workspace token offline. Connect Google Workspace first.",
      });
      return;
    }
    if (!calendarEventTime) {
      toast({ variant: "info", description: "Specify a date and time for the viewing first." });
      return;
    }

    const confirmed = window.confirm(
      `Schedule showing appointment for "${prop.title}" in your Google Calendar?`,
    );
    if (!confirmed) return;

    setCalendarSchedulingPropId(prop.id);

    try {
      const response = await fetch("/api/properties", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          action: "create_calendar_event",
          property: prop,
          startDateTime: new Date(calendarEventTime).toISOString(),
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to add calendar schedule event.");
      }

      toast({
        variant: "success",
        description: "Calendar event created.",
        action: { label: "Open event", onClick: () => window.open(data.htmlLink, "_blank") },
      });
      // Clear scheduling inputs
      setCalendarEventTime("");
    } catch (err: unknown) {
      console.error(err);
      toast({
        variant: "error",
        description: `Calendar integration error: ${getErrorMessage(err)}`,
      });
    } finally {
      setCalendarSchedulingPropId(null);
    }
  };

  // Create real-time search match alert criterion
  const handleCreateAlert = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !activeOwnerUid) return;
    if (!newAlertName) return;
    if (!canWrite) {
      toast({ variant: "error", description: "You have view-only access to this workspace." });
      return;
    }

    const alertId = `alert_${Date.now()}`;
    const path = `alerts/${alertId}`;

    // The stored `userId` is the ACTIVE WORKSPACE owner's uid (owner-pinned), so an editor
    // creating an alert writes it into the owner's workspace, not their own (WS18).
    const alertData: PropertyAlert = {
      id: alertId,
      userId: activeOwnerUid,
      name: newAlertName,
      criteria: {
        city: newAlertCity,
        maxPrice: newAlertMaxPrice ? parseInt(newAlertMaxPrice) : undefined,
        beds: parseInt(newAlertMinBeds),
      },
      isActive: true,
      createdAt: new Date().toISOString(),
    };

    try {
      await setDoc(doc(db, "alerts", alertId), alertData);
      setNewAlertName("");
      setNewAlertMaxPrice("");
      toast({
        variant: "success",
        description: `Alert "${alertData.name}" is now monitoring incoming listings.`,
      });
    } catch (err: unknown) {
      handleFirestoreError(err, OperationType.CREATE, path);
    }
  };

  // Delete an active alert query
  const handleDeleteAlert = async (alertId: string) => {
    if (!user) return;
    if (!canWrite) {
      toast({ variant: "error", description: "You have view-only access to this workspace." });
      return;
    }
    const path = `alerts/${alertId}`;
    try {
      await deleteDoc(doc(db, "alerts", alertId));
      toast({ variant: "info", description: "Alert monitor removed." });
    } catch (err: unknown) {
      handleFirestoreError(err, OperationType.DELETE, path);
    }
  };

  // Delete a shared-catalog listing (WS16). Client writes to `properties/*` are denied by
  // Firestore rules, so the delete routes through /api/properties (action `delete_listing`)
  // with the user's Firebase ID token; the server removes it via the Admin SDK.
  const handleDeleteProperty = async (propId: string) => {
    if (!user) return;
    try {
      const idToken = await user.getIdToken();
      const response = await fetch("/api/properties", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ action: "delete_listing", listingId: propId }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to delete listing.");
      }
      toast({ variant: "info", description: "Property listing deleted." });
    } catch (err: unknown) {
      toast({ variant: "error", description: `Delete failed: ${getErrorMessage(err)}` });
    }
  };

  // Check matching rules
  const checkForAlertMatch = (property: ListingProperty) => {
    alerts.forEach((alert) => {
      let isMatch = true;
      if (
        alert.criteria.city &&
        property.city.toLowerCase() !== alert.criteria.city.toLowerCase()
      ) {
        isMatch = false;
      }
      if (alert.criteria.maxPrice && property.price > alert.criteria.maxPrice) {
        isMatch = false;
      }
      if (alert.criteria.beds && property.beds < alert.criteria.beds) {
        isMatch = false;
      }

      if (isMatch) {
        toast({
          variant: "success",
          title: `Alert match: ${alert.name}`,
          description: `${property.title} in ${property.city} — $${property.price.toLocaleString()} (${property.beds}b/${property.baths}b)`,
          action: {
            label: "Inspect lead",
            onClick: () => {
              setActiveTab("listings");
              setSearchTerm(property.title);
            },
          },
        });
      }
    });
  };

  // Filtering calculations
  const cities = Array.from(new Set(properties.map((p) => p.city)));
  const hasActiveFilters =
    searchTerm.trim().length > 0 || cityFilter !== "All" || favoritesOnly || showHidden;

  const resolvedAlertMatches = alertMatches.map((match) => ({
    match,
    alert: alerts.find((alert) => alert.id === match.alertId),
    property: properties.find((property) => property.id === match.listingId),
  }));

  const hiddenCount = properties.filter((p) => prefs.states[p.id] === "hidden").length;

  const filteredProperties = filterListings(properties, {
    searchTerm,
    cityFilter,
    states: prefs.states,
    showHidden,
    favoritesOnly,
  });

  // Listings currently queued for comparison, in queue order.
  const compareListings = prefs.compareIds
    .map((id) => properties.find((p) => p.id === id))
    .filter((p): p is ListingProperty => Boolean(p));

  return (
    <div className="selection:bg-primary-500 flex min-h-screen flex-col bg-stone-50 font-sans text-stone-900 selection:text-stone-950 dark:bg-stone-950 dark:text-stone-100">
      {/* 1. TOP HEADER NAVIGATION PANEL */}
      <header className="sticky top-0 z-40 border-b border-stone-200 bg-white backdrop-blur dark:border-stone-900 dark:bg-stone-900/40">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center space-x-3">
            <div className="bg-primary-500/10 text-primary-500 rounded-lg p-2">
              <Building2 className="h-5 w-5" />
            </div>
            <span className="font-sans text-lg font-bold tracking-tight text-stone-900 dark:text-white">
              Abode Alerts
            </span>

            {/* Primary Inner Navigation */}
            <nav className="hidden space-x-4 pl-8 lg:flex lg:space-x-8">
              {DASHBOARD_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`py-5 text-xs font-semibold tracking-wider uppercase ${
                    activeTab === tab.id
                      ? "text-primary-500 border-primary-500 border-b-2"
                      : "border-b-2 border-transparent text-stone-500 hover:text-stone-900 dark:text-stone-100 dark:hover:text-stone-900"
                  }`}
                >
                  <span className="flex items-center space-x-1.5">
                    <span>{tab.label}</span>
                  </span>
                </button>
              ))}
            </nav>
          </div>

          <div className="flex items-center space-x-4">
            {/* Workspace switcher — only when the user belongs to >1 workspace (WS18). */}
            {user && workspacesApi.workspaces.length > 1 ? (
              <label className="hidden items-center gap-1.5 sm:flex">
                <span className="sr-only">Active workspace</span>
                <select
                  value={workspacesApi.activeOwnerUid}
                  onChange={(e) => workspacesApi.setActiveOwnerUid(e.target.value)}
                  className="max-w-[12rem] truncate rounded-lg border border-stone-200 bg-stone-50 px-2.5 py-1.5 text-xs font-semibold text-stone-700 focus:outline-none dark:border-stone-800 dark:bg-stone-950 dark:text-stone-200"
                  aria-label="Active workspace"
                >
                  {workspacesApi.workspaces.map((w) => (
                    <option key={w.ownerUid} value={w.ownerUid}>
                      {w.label}
                      {w.isOwn ? "" : ` (${w.role})`}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            {/* Status panel */}
            <ThemeControls />

            {authLoading ? (
              <Loader2 className="text-primary-500 h-5 w-5 animate-spin" />
            ) : user ? (
              <ProfileMenu
                user={user}
                onSignOut={handleLogout}
                onShareWorkspace={() => setShareOpen(true)}
              />
            ) : (
              <GoogleSignInButton onClick={handleGoogleAuth} />
            )}
          </div>
        </div>
      </header>

      {/* Share-workspace management dialog (WS18). Targets the active workspace. */}
      {user ? (
        <ShareWorkspaceDialog
          user={user}
          ownerUid={workspacesApi.activeOwnerUid || user.uid}
          open={shareOpen}
          onClose={() => setShareOpen(false)}
        />
      ) : null}

      {/* Alert matches and workspace events surface through the toast system (components/ui/toast.tsx). */}
      <main className="mx-auto w-full max-w-7xl grow px-4 py-8 sm:px-6 lg:px-8">
        {/* TAB VIEW CONTAINER ROUTING */}
        {activeTab === "listings" && (
          <div className="space-y-6">
            <div className="flex flex-col items-center justify-between gap-4 rounded-xl border border-stone-200 bg-white p-4 shadow-sm md:flex-row dark:border-stone-800 dark:bg-stone-900">
              <div className="relative w-full md:max-w-md">
                <Search className="absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-stone-500" />
                <input
                  type="text"
                  placeholder="Search listings address, zip, city or title..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="focus:border-primary-500 w-full rounded-lg border border-stone-200 bg-stone-50 py-2 pr-4 pl-10 font-sans text-xs font-medium text-stone-900 placeholder-stone-500 focus:outline-none dark:border-stone-800 dark:bg-stone-950 dark:text-stone-200"
                />
              </div>

              <div className="flex w-full flex-wrap items-center gap-3 md:w-auto">
                <div className="flex items-center space-x-2 text-xs font-semibold tracking-wider text-stone-500 uppercase">
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                  <span>City Filtering</span>
                </div>
                <select
                  value={cityFilter}
                  onChange={(e) => setCityFilter(e.target.value)}
                  title="Filter by city"
                  className="focus:border-primary-500 rounded-lg border border-stone-200 bg-stone-50 p-2 text-xs font-semibold text-stone-900 focus:outline-none dark:border-stone-800 dark:bg-stone-950 dark:text-stone-300"
                >
                  <option value="All">All Cities</option>
                  {cities.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>

                {user && (
                  <>
                    <FilterToggle
                      active={favoritesOnly}
                      onClick={() => setFavoritesOnly((v) => !v)}
                      icon={
                        <Heart className={`h-3.5 w-3.5 ${favoritesOnly ? "fill-current" : ""}`} />
                      }
                      label="Favorites"
                    />
                    <FilterToggle
                      active={showHidden}
                      onClick={() => setShowHidden((v) => !v)}
                      icon={
                        showHidden ? (
                          <Eye className="h-3.5 w-3.5" />
                        ) : (
                          <EyeOff className="h-3.5 w-3.5" />
                        )
                      }
                      label={hiddenCount > 0 ? `Hidden (${hiddenCount})` : "Hidden"}
                    />
                    {prefs.compareIds.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setCompareOpen(true)}
                        className="border-primary-500 bg-primary-500 inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-xs font-semibold text-white transition hover:opacity-90"
                      >
                        <GitCompareArrows className="h-3.5 w-3.5" />
                        Compare ({prefs.compareIds.length})
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>

            <ListingsGrid
              properties={filteredProperties}
              totalPropertyCount={properties.length}
              hasActiveFilters={hasActiveFilters}
              onExportToSheet={exportListingToGoogleSheet}
              onScheduleViewing={bookCalendarViewingEvent}
              onDeleteProperty={handleDeleteProperty}
              sheetsExportingPropId={sheetsExportingPropId}
              calendarSchedulingPropId={calendarSchedulingPropId}
              calendarEventTime={calendarEventTime}
              onCalendarEventTimeChange={setCalendarEventTime}
              hasWorkspaceAccess={Boolean(user && accessToken)}
              prefs={gridPrefs}
              isSignedIn={Boolean(user)}
              onAnalyze={analyzeListing}
            />
          </div>
        )}

        {activeTab === "docs" && <DocsView />}
        {activeTab === "cma" && (
          <CMAView properties={properties} prefs={gridPrefs} isSignedIn={Boolean(user)} />
        )}
        {activeTab === "wizard" && <AlertsWizardView />}

        {activeTab === "harvester" && (
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
            {/* HARVESTER CONTROL OPTIONS */}
            <div className="space-y-6 lg:col-span-4">
              {/* OPTIONS BOX 1: GMAIL SCANNER */}
              <div className="space-y-5 rounded-2xl border border-stone-200 bg-white p-6 shadow-lg dark:border-stone-800 dark:bg-stone-900">
                <div className="flex items-center space-x-2 border-b border-stone-200 pb-4 dark:border-stone-800">
                  <Mail className="text-primary-500 h-5 w-5" />
                  <h2 className="text-sm font-bold text-stone-900 dark:text-white">
                    Gmail Alert Harvester
                  </h2>
                </div>

                {!user || !accessToken ? (
                  <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-4 text-center text-amber-700 dark:text-amber-300">
                    <AlertTriangle className="mx-auto mb-2 h-8 w-8 text-amber-500" />
                    <span className="mb-1 block text-xs font-bold">
                      Google Workspace Auth Required
                    </span>
                    <p className="mb-4 text-[11px] leading-relaxed text-stone-400">
                      Abode Alerts requires secure OAuth permission to verify and safely parse alert
                      emails of listings directly from your inbox. No data is stored outside your
                      account.
                    </p>
                    <button
                      onClick={handleGoogleAuth}
                      className="bg-primary-600 hover:bg-primary-500 border-primary-500 w-full cursor-pointer rounded border px-4 py-2 font-mono text-xs font-semibold text-white shadow transition"
                    >
                      Authorize Google Services
                    </button>
                  </div>
                ) : (
                  <div className="space-y-5">
                    <p className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-[11px] leading-relaxed text-emerald-300">
                      Ingestion runs <span className="font-bold">automatically</span> — a new
                      listing-alert email triggers the pipeline and lands the listing here within
                      minutes. Choose which platforms to watch below; the manual scan is an optional
                      fallback.
                    </p>

                    <IngestPlatformSelector
                      selected={platformSelection}
                      customQuery={customQuery}
                      onChange={({ selected, customQuery: nextCustom }) => {
                        setPlatformSelection(selected);
                        setCustomQuery(nextCustom);
                      }}
                    />

                    <button
                      onClick={persistPlatformSelection}
                      disabled={isSavingFilter}
                      className="bg-primary-600 hover:bg-primary-500 border-primary-500 flex w-full cursor-pointer items-center justify-center gap-1.5 rounded border p-2.5 font-mono text-xs font-bold text-white shadow transition disabled:opacity-40"
                    >
                      {isSavingFilter ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span>Saving filter...</span>
                        </>
                      ) : (
                        <span>Save Platform Filter</span>
                      )}
                    </button>

                    <div className="border-t border-stone-200 pt-4 dark:border-stone-800">
                      <button
                        type="button"
                        onClick={() => setShowAdvancedScan((v) => !v)}
                        aria-expanded={showAdvancedScan}
                        className="flex w-full items-center justify-between font-mono text-[11px] tracking-wider text-stone-400 uppercase hover:text-stone-200"
                      >
                        <span>Advanced — Manual Scan</span>
                        <span>{showAdvancedScan ? "−" : "+"}</span>
                      </button>

                      {showAdvancedScan && (
                        <div className="mt-4 space-y-4">
                          <div>
                            <label className="mb-1.5 block font-mono text-[11px] tracking-wider text-stone-400 uppercase">
                              Search Limit (Emails count)
                            </label>
                            <select
                              value={gmailMaxResults}
                              onChange={(e) => setGmailMaxResults(parseInt(e.target.value))}
                              title="Search limit"
                              className="w-full rounded border border-stone-200 bg-stone-50 p-2.5 font-mono text-xs text-stone-900 dark:border-stone-800 dark:bg-stone-950 dark:text-stone-200"
                            >
                              <option value={3}>Latest 3 Matching Emails</option>
                              <option value={5}>Latest 5 Matching Emails</option>
                              <option value={10}>Latest 10 Matching Emails</option>
                            </select>
                          </div>

                          <button
                            onClick={triggerGmailHarvest}
                            disabled={isScanningGmail}
                            className="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded border border-stone-700 bg-stone-100 p-3 font-mono text-xs font-bold text-stone-900 shadow-md transition disabled:opacity-40 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700"
                          >
                            {isScanningGmail ? (
                              <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                <span>Harvesting Real Alerts...</span>
                              </>
                            ) : (
                              <>
                                <Mail className="h-4 w-4" />
                                <span>Scan Gmail Inbox Now</span>
                              </>
                            )}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* OPTIONS BOX 2: DIRECT COPY-PASTER */}
              <div className="space-y-4 rounded-2xl border border-stone-200 bg-white p-6 shadow-lg dark:border-stone-800 dark:bg-stone-900">
                <div className="flex items-center space-x-2 border-b border-stone-200 pb-3 dark:border-stone-800">
                  <FileText className="h-5 w-5 text-blue-500" />
                  <h2 className="text-sm font-bold text-stone-900 dark:text-white">
                    Direct Raw Alert Parser
                  </h2>
                </div>

                <p className="text-[11px] leading-relaxed text-stone-500 dark:text-stone-400">
                  Paste the body of a real-estate alert email or a copied listing snippet. Gemini
                  extracts the structured listing from the text only — prices, photos, and details
                  are never invented. Review the result below before committing it.
                </p>

                <div className="space-y-3">
                  <textarea
                    rows={4}
                    value={directPastedText}
                    onChange={(e) => setDirectPastedText(e.target.value)}
                    placeholder="Paste email alert body or listing details text here..."
                    className="w-full rounded border border-stone-200 bg-stone-50 p-2.5 font-mono text-xs text-stone-900 focus:outline-none dark:border-stone-800 dark:bg-stone-950 dark:text-stone-200"
                  />

                  <button
                    onClick={triggerDirectTextParse}
                    disabled={isParsingDirect || !directPastedText.trim()}
                    className="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded border border-stone-700 bg-stone-100 p-2.5 text-xs font-bold text-stone-900 transition hover:bg-stone-200 disabled:opacity-30 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700"
                  >
                    {isParsingDirect ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        <span>Extracting listing...</span>
                      </>
                    ) : (
                      <>
                        <Send className="h-3.5 w-3.5 text-blue-400" />
                        <span>Parse Text to Property Schema</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* PREVIEW CONTAINER FOR COMMIT */}
            <div className="flex flex-col justify-between rounded-2xl border border-stone-200 bg-white p-6 shadow-lg lg:col-span-8 dark:border-stone-800 dark:bg-stone-900">
              <div>
                <div className="mb-4 flex items-center justify-between border-b border-stone-200 pb-4 dark:border-stone-800">
                  <div className="flex items-center space-x-2">
                    <Sparkles className="text-primary-500 h-5 w-5" />
                    <h2 className="font-sans text-sm font-bold text-stone-900 dark:text-white">
                      Review &amp; Commit
                    </h2>
                  </div>
                  {harvestedPreviews.length > 0 && user && (
                    <button
                      onClick={commitListingsToFirestore}
                      className="bg-primary-600 hover:bg-primary-500 border-primary-500 flex cursor-pointer items-center space-x-1 rounded border px-3 py-1.5 text-xs font-bold text-white shadow transition"
                    >
                      <PlusCircle className="h-3.5 w-3.5" />
                      <span>
                        Save {harvestedPreviews.length}{" "}
                        {harvestedPreviews.length === 1 ? "listing" : "listings"} to database
                      </span>
                    </button>
                  )}
                </div>

                {isScanningGmail || isParsingDirect ? (
                  <div className="space-y-3 py-24 text-center">
                    <Loader2 className="text-primary-500 mx-auto h-10 w-10 animate-spin" />
                    <span className="block animate-pulse font-mono text-xs text-stone-400">
                      Analyzing input text elements &amp; compiling models...
                    </span>
                  </div>
                ) : harvestedPreviews.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-stone-200 bg-stone-100/40 py-20 text-center dark:border-stone-800 dark:bg-stone-950/40">
                    <Cloud className="mx-auto mb-3 h-10 w-10 text-stone-600" />
                    <h3 className="font-mono text-xs font-bold text-stone-700 dark:text-stone-300">
                      Scanner buffer empty
                    </h3>
                    <p className="m-auto mt-1 max-w-sm text-[11px] leading-relaxed text-stone-500">
                      Log in to your Gmail, select a search filter, and harvest live alerts, or
                      copy-paste text in the direct parser block!
                    </p>
                  </div>
                ) : (
                  <div className="max-h-120 space-y-4 overflow-y-auto pr-2">
                    {harvestedPreviews.map((item, idx) => (
                      <div
                        key={idx}
                        className="flex flex-col items-start justify-between gap-4 rounded-xl border border-stone-200 bg-stone-50 p-3.5 sm:flex-row sm:items-center dark:border-stone-800 dark:bg-stone-950"
                      >
                        <div className="flex items-center space-x-3.5">
                          <div className="h-14 w-14 shrink-0 overflow-hidden rounded border border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900">
                            {item.imageUrl ? (
                              <img
                                src={item.imageUrl}
                                alt={item.title}
                                referrerPolicy="no-referrer"
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <NoListingMedia />
                            )}
                          </div>
                          <div>
                            <h4 className="text-xs leading-tight font-bold text-stone-900 dark:text-white">
                              {item.title}
                            </h4>
                            <span className="mt-0.5 block font-mono text-[11px] text-stone-500 dark:text-stone-400">
                              {item.address}, {item.city}
                            </span>
                            <span className="mt-1 block font-mono text-[10px] text-stone-500">
                              Beds: {item.beds} | Baths: {item.baths} | Size: {item.sqft} sqft
                            </span>
                          </div>
                        </div>

                        <div className="flex w-full shrink-0 items-center justify-between border-t border-stone-200 pt-2 text-right sm:w-auto sm:flex-col sm:items-end sm:border-t-0 sm:pt-0 dark:border-stone-800">
                          <span className="text-primary-600 dark:text-primary-400 block font-mono text-sm font-bold">
                            ${item.price.toLocaleString()}
                          </span>
                          <span className="mt-0.5 block rounded border border-stone-200 bg-white px-2 py-0.5 font-mono text-[9px] tracking-wide text-stone-500 uppercase dark:border-stone-800 dark:bg-stone-900">
                            Ready to Commit
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === "alerts" && (
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
            {/* ALERTS SCHEDULER FORM */}
            <div className="h-fit space-y-5 rounded-2xl border border-stone-200 bg-white p-6 shadow-lg lg:col-span-4 dark:border-stone-800 dark:bg-stone-900">
              <div className="flex items-center space-x-2 border-b border-stone-200 pb-4 dark:border-stone-800">
                <Bell className="text-primary-400 h-5 w-5" />
                <h2 className="text-sm font-bold text-stone-900 dark:text-white">
                  Create Lead Monitor
                </h2>
              </div>

              {user && !canWrite ? (
                <div className="rounded-xl border border-stone-200 bg-stone-50 p-4 text-center dark:border-stone-800 dark:bg-stone-950">
                  <ShieldCheck className="mx-auto mb-2 h-7 w-7 text-stone-400" />
                  <span className="mb-1 block text-xs font-bold text-stone-700 dark:text-stone-200">
                    View-only access
                  </span>
                  <p className="text-[11px] leading-relaxed text-stone-500">
                    You can view this workspace&apos;s alerts and matches, but only the owner or an
                    editor can create or mute monitors.
                  </p>
                </div>
              ) : !user ? (
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-4 text-center text-amber-300">
                  <span className="mb-1 block text-xs font-bold">Authorization Required</span>
                  <p className="mb-3 text-[11px] leading-relaxed text-stone-400">
                    Please sign in to configure alerts.
                  </p>
                  <button
                    onClick={handleGoogleAuth}
                    className="bg-primary-600 w-full cursor-pointer rounded px-4 py-1.5 text-xs font-bold text-stone-950 transition"
                  >
                    Sign In
                  </button>
                </div>
              ) : (
                <form onSubmit={handleCreateAlert} className="space-y-4">
                  <div>
                    <label className="mb-1.5 block font-mono text-[11px] tracking-wider text-stone-400 uppercase">
                      Alert Name
                    </label>
                    <input
                      type="text"
                      required
                      value={newAlertName}
                      onChange={(e) => setNewAlertName(e.target.value)}
                      placeholder="e.g. Stow homes under $400k"
                      className="w-full rounded border border-stone-200 bg-stone-50 p-2.5 font-sans text-xs text-stone-900 focus:outline-none dark:border-stone-800 dark:bg-stone-950 dark:text-stone-200"
                    />
                  </div>

                  <div>
                    <label className="mb-1.5 block font-mono text-[11px] tracking-wider text-stone-400 uppercase">
                      Target City Area
                    </label>
                    <input
                      type="text"
                      required
                      value={newAlertCity}
                      onChange={(e) => setNewAlertCity(e.target.value)}
                      placeholder={`e.g. ${DEFAULT_ALERT_CITY}`}
                      className="w-full rounded border border-stone-200 bg-stone-50 p-2.5 font-sans text-xs text-stone-900 focus:outline-none dark:border-stone-800 dark:bg-stone-950 dark:text-stone-200"
                    />
                  </div>

                  <div>
                    <label className="mb-1.5 block font-mono text-[11px] tracking-wider text-stone-400 uppercase">
                      Maximum Price ($)
                    </label>
                    <input
                      type="number"
                      value={newAlertMaxPrice}
                      onChange={(e) => setNewAlertMaxPrice(e.target.value)}
                      placeholder="e.g. 750000"
                      className="w-full rounded border border-stone-200 bg-stone-50 p-2.5 font-mono text-xs text-stone-900 focus:outline-none dark:border-stone-800 dark:bg-stone-950 dark:text-stone-200"
                    />
                  </div>

                  <div>
                    <label className="mb-1.5 block font-mono text-[11px] tracking-wider text-stone-400 uppercase">
                      Minimum Bedrooms
                    </label>
                    <select
                      value={newAlertMinBeds}
                      onChange={(e) => setNewAlertMinBeds(e.target.value)}
                      title="Minimum bedrooms"
                      className="w-full rounded border border-stone-200 bg-stone-50 p-2.5 font-sans text-xs text-stone-900 focus:outline-none dark:border-stone-800 dark:bg-stone-950 dark:text-stone-200"
                    >
                      <option value="1">1+ Beds</option>
                      <option value="2">2+ Beds</option>
                      <option value="3">3+ Beds</option>
                      <option value="4">4+ Beds</option>
                    </select>
                  </div>

                  <button
                    type="submit"
                    className="bg-primary-600 hover:bg-primary-500 border-primary-500 w-full cursor-pointer rounded border p-3 text-center font-mono text-xs font-bold text-stone-950 shadow transition"
                  >
                    Set Active Alert Trigger Rule
                  </button>
                </form>
              )}
            </div>

            <div className="space-y-6 lg:col-span-8">
              {/* LIVE ACTIVE ALERTS ROW MATCH LISTING */}
              <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-lg dark:border-stone-800 dark:bg-stone-900">
                <div className="mb-4 flex items-center justify-between border-b border-stone-200 pb-4 dark:border-stone-800">
                  <span className="font-sans text-sm font-bold text-stone-900 dark:text-white">
                    Active Monitoring Queries
                  </span>
                  <span className="font-mono text-[10px] text-stone-500 uppercase">
                    {BASELINE_ZIP} area criteria
                  </span>
                </div>

                {!user ? (
                  <div className="py-20 text-center font-mono text-xs text-stone-500">
                    Login with Google to deploy and audit custom alert triggers.
                  </div>
                ) : alerts.length === 0 ? (
                  <div className="mx-auto max-w-sm py-20 text-center font-mono text-xs text-stone-500">
                    <Bell className="mx-auto mb-3 h-10 w-10 text-stone-700" />
                    <span>
                      No active alert triggers configured yet. Create one to monitor listings around{" "}
                      {DEFAULT_ALERT_CITY} and the {BASELINE_ZIP} radius.
                    </span>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    {alerts.map((a) => (
                      <div
                        key={a.id}
                        className="flex flex-col justify-between rounded-xl border border-stone-200 bg-stone-50 p-4 dark:border-stone-800 dark:bg-stone-950"
                      >
                        <div>
                          <div className="mb-2 flex items-center justify-between">
                            <h4 className="font-mono text-xs font-bold tracking-wider text-stone-900 uppercase dark:text-white">
                              {a.name}
                            </h4>
                            <span className="bg-primary-400 h-2 w-2 animate-pulse rounded-full" />
                          </div>
                          <ul className="space-y-1 rounded border border-stone-200 bg-white p-2.5 font-mono text-[10px] text-stone-400 dark:border-stone-900 dark:bg-stone-900/40">
                            <li>
                              Target Area:{" "}
                              <strong className="text-stone-900 dark:text-stone-200">
                                {a.criteria.city}
                              </strong>
                            </li>
                            {a.criteria.maxPrice && (
                              <li>
                                Max Cap Limit:{" "}
                                <strong className="text-stone-900 dark:text-stone-200">
                                  ${a.criteria.maxPrice.toLocaleString()}
                                </strong>
                              </li>
                            )}
                            <li>
                              Bedrooms criteria:{" "}
                              <strong className="text-stone-900 dark:text-stone-200">
                                {a.criteria.beds}+ Beds
                              </strong>
                            </li>
                          </ul>
                        </div>
                        <div className="mt-4 flex items-center justify-between border-t border-stone-200 pt-3 dark:border-stone-900">
                          <span className="font-mono text-[9px] text-stone-500">UUID: {a.id}</span>
                          {canWrite ? (
                            <button
                              onClick={() => handleDeleteAlert(a.id)}
                              className="flex cursor-pointer items-center space-x-1 font-mono text-[11px] text-red-400 transition hover:text-red-300"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              <span>Mute Monitor</span>
                            </button>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* PERSISTED ALERT MATCHES */}
              <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-lg dark:border-stone-800 dark:bg-stone-900">
                <div className="mb-4 flex items-center justify-between border-b border-stone-200 pb-4 dark:border-stone-800">
                  <span className="font-sans text-sm font-bold text-stone-900 dark:text-white">
                    Persisted Alert Matches
                  </span>
                  <span className="font-mono text-[10px] text-stone-500 uppercase">
                    Saved from daily refresh
                  </span>
                </div>

                {!user ? (
                  <div className="py-12 text-center font-mono text-xs text-stone-500">
                    Sign in to view alert matches saved by the ingestion pipeline.
                  </div>
                ) : resolvedAlertMatches.length === 0 ? (
                  <div className="mx-auto max-w-lg py-12 text-center">
                    <Bell className="mx-auto mb-3 h-10 w-10 text-stone-700" />
                    <p className="font-mono text-xs leading-relaxed text-stone-500">
                      No persisted matches yet. Matches appear here after daily refresh evaluates
                      your active alerts against the {BASELINE_ZIP} listing inventory.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {resolvedAlertMatches.map(({ match, alert, property }) => (
                      <div
                        key={match.id}
                        className="flex flex-col gap-3 rounded-xl border border-stone-200 bg-stone-50 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-stone-800 dark:bg-stone-950"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="mb-1 flex flex-wrap items-center gap-2">
                            <span className="bg-primary-500/10 text-primary-500 rounded-full px-2 py-0.5 font-mono text-[10px] font-bold tracking-wider uppercase">
                              {alert?.name || "Deleted alert"}
                            </span>
                            <span className="font-mono text-[10px] text-stone-500">
                              Last seen {new Date(match.lastSeenAt).toLocaleString()}
                            </span>
                          </div>
                          <h4 className="truncate text-sm font-bold text-stone-900 dark:text-stone-100">
                            {property?.title || `Listing ${match.listingId}`}
                          </h4>
                          <p className="mt-1 font-mono text-[11px] text-stone-500">
                            {property
                              ? `${property.address}, ${property.city} — $${property.price.toLocaleString()}`
                              : "Listing details unavailable until inventory syncs."}
                          </p>
                          <p className="mt-2 font-mono text-[10px] text-stone-400">
                            Match reason: {match.matchReason}
                          </p>
                        </div>
                        {property && (
                          <button
                            type="button"
                            onClick={() => {
                              setActiveTab("listings");
                              setSearchTerm(property.title);
                            }}
                            className="text-primary-950 hover:bg-primary-50 shrink-0 cursor-pointer rounded bg-white px-4 py-2 text-xs font-bold shadow transition dark:bg-stone-900 dark:text-stone-100 dark:hover:bg-stone-800"
                          >
                            View Listing
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      <CompareDialog
        open={compareOpen}
        onClose={() => setCompareOpen(false)}
        listings={compareListings}
        onRemove={(id) =>
          prefs
            .removeFromCompare(id)
            .catch((error: unknown) =>
              toast({ variant: "error", description: getErrorMessage(error) }),
            )
        }
        onClear={() => {
          prefs
            .clearCompare()
            .catch((error: unknown) =>
              toast({ variant: "error", description: getErrorMessage(error) }),
            );
          setCompareOpen(false);
        }}
      />

      {/* FOOTER */}
      <footer className="mt-12 border-t border-stone-200 bg-stone-100/40 py-6 text-center dark:border-stone-900 dark:bg-stone-950/40">
        <span className="block font-mono text-[10px] text-stone-500">
          &copy; 2026 Abode Alerts. Property monitoring for the {BASELINE_ZIP} Stow/Akron area with
          real ingestion and alert matching.
        </span>
      </footer>
    </div>
  );
}
