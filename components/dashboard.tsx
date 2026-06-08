"use client";

import React, { useState, useEffect } from "react";
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
  SlidersHorizontal,
  Sparkles,
  Trash2,
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
import { onAuthStateChanged, User, GoogleAuthProvider } from "firebase/auth";

import { getErrorMessage } from "../lib/errors";
import { DASHBOARD_TABS, type DashboardTab } from "../types/dashboard";
import { ListingProperty, PropertyAlert } from "../types/listings";
import { DocsView } from "./views/DocsView";
import { AlertsWizardView } from "./views/AlertsWizardView";
import { ListingsGrid } from "./views/ListingsGrid";
import { CMAView } from "./views/CMAView";
import { ThemeControls } from "./theme-controls";

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

function GoogleSignInButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-stone-300 bg-white px-4 py-2 text-xs font-semibold text-stone-700 shadow-sm transition hover:bg-stone-50 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100 dark:hover:bg-stone-900"
    >
      <GoogleGlyph />
      <span>{label}</span>
    </button>
  );
}

function UserAvatar({ user }: { user: User }) {
  const label = user.displayName || user.email || "Google account";

  if (user.photoURL) {
    return (
      <img
        src={user.photoURL}
        alt={label}
        referrerPolicy="no-referrer"
        className="h-9 w-9 rounded-full border border-stone-200 bg-white object-cover shadow-sm dark:border-stone-700"
      />
    );
  }

  return (
    <div
      className="bg-primary-500 flex h-9 w-9 items-center justify-center rounded-full border border-stone-200 text-xs font-bold text-white shadow-sm dark:border-stone-700"
      aria-label={label}
    >
      {label.slice(0, 1).toUpperCase()}
    </div>
  );
}

export default function Dashboard() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [accessToken, setAccessToken] = useState<string | null>(null);

  const [properties, setProperties] = useState<ListingProperty[]>([]);
  const [alerts, setAlerts] = useState<PropertyAlert[]>([]);
  const [activeTab, setActiveTab] = useState<DashboardTab>("listings");

  // Filtering & Search state
  const [searchTerm, setSearchTerm] = useState("");
  const [cityFilter, setCityFilter] = useState("All");

  // Alert form state
  const [newAlertName, setNewAlertName] = useState("");
  const [newAlertCity, setNewAlertCity] = useState("Austin");
  const [newAlertMaxPrice, setNewAlertMaxPrice] = useState("");
  const [newAlertMinBeds, setNewAlertMinBeds] = useState("2");

  // Gmail Harvester controls
  const [gmailQuery, setGmailQuery] = useState(
    'subject:"Redfin" OR subject:"Zillow" OR "new listing"',
  );
  const [gmailMaxResults, setGmailMaxResults] = useState(5);
  const [isScanningGmail, setIsScanningGmail] = useState(false);
  const [harvestedPreviews, setHarvestedPreviews] = useState<ListingProperty[]>([]);

  // Direct Text Parser controls
  const [directPastedText, setDirectPastedText] = useState("");
  const [isParsingDirect, setIsParsingDirect] = useState(false);

  // Workspace integration loading states for specific property cards
  const [sheetsExportingPropId, setSheetsExportingPropId] = useState<string | null>(null);
  const [sheetLink, setSheetLink] = useState<{ id: string; url: string } | null>(null);
  const [calendarSchedulingPropId, setCalendarSchedulingPropId] = useState<string | null>(null);
  const [calendarEventTime, setCalendarEventTime] = useState<string>("");
  const [logMessage, setLogMessage] = useState<string>("");

  // Live Alert Matches trigger state
  const [recentMatch, setRecentMatch] = useState<{
    property: ListingProperty;
    alertName: string;
  } | null>(null);

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

    // 2. Alerts snapshot listener
    if (user) {
      try {
        const qAlerts = query(collection(db, "alerts"), where("userId", "==", user.uid));
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
    } else {
      setAlerts([]);
    }

    return () => {
      unsubProperties();
      unsubAlerts();
    };
  }, [user, authLoading]);

  // Authenticate user & capture Google Access Token in-memory
  const handleGoogleAuth = async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (credential?.accessToken) {
        setAccessToken(credential.accessToken);
        setLogMessage("Successfully authenticated and connected Google Workspace API services!");
      } else {
        setLogMessage("Signed in successfully, but Workspace token access was restricted.");
      }
    } catch (error: unknown) {
      console.error("Google Auth error:", error);
      setLogMessage(`Authorization failed: ${getErrorMessage(error)}`);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setAccessToken(null);
      setLogMessage("Signed out of services.");
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  // Harvest real estate alert updates from real Gmail
  const triggerGmailHarvest = async () => {
    if (!user || !accessToken) {
      setLogMessage(
        "Active Google Workspace token required. Click 'Connect Google Services' top right.",
      );
      return;
    }
    setIsScanningGmail(true);
    setHarvestedPreviews([]);
    setLogMessage("Scanning unread/labeled real estate notification alert emails in Gmail...");

    try {
      const response = await fetch("/api/properties", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          action: "parse_gmail",
          query: gmailQuery,
          maxResults: gmailMaxResults,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to parse matching email listings.");
      }

      setHarvestedPreviews(data.properties || []);
      setLogMessage(
        `Harvest completed: Found ${data.properties?.length || 0} real estate listings inside your Gmail inbox matching "${gmailQuery}".`,
      );
    } catch (error: unknown) {
      console.error(error);
      setLogMessage(`Gmail Harvester Error: ${getErrorMessage(error)}`);
    } finally {
      setIsScanningGmail(false);
    }
  };

  // Submit direct raw email text or copy-pasted webpage alerts to Gemini
  const triggerDirectTextParse = async () => {
    if (!directPastedText.trim()) {
      setLogMessage("Please paste details first.");
      return;
    }
    setIsParsingDirect(true);
    setLogMessage("Executing server-side Gemini listing extraction pipeline...");

    try {
      const response = await fetch("/api/properties", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
        setLogMessage(
          "Gemini successfully structured the listing! Review details below & commit to DB.",
        );
      } else {
        setLogMessage("Gemini was unable to recognize any real property details in that string.");
      }
    } catch (error: unknown) {
      console.error(error);
      setLogMessage(`Parser Error: ${getErrorMessage(error)}`);
    } finally {
      setIsParsingDirect(false);
    }
  };

  // Commit Harvested/Parsed Listings to Firestore DB
  const commitListingsToFirestore = async () => {
    if (!user || harvestedPreviews.length === 0) return;
    setLogMessage("Writing structured property listings to secure Firestore database...");

    let successCount = 0;
    try {
      for (const prop of harvestedPreviews) {
        const path = `properties/${prop.id}`;
        try {
          // Lock to database
          await setDoc(doc(db, "properties", prop.id), prop);
          successCount++;

          // Sync with alerts trigger notification
          checkForAlertMatch(prop);
        } catch (err: unknown) {
          handleFirestoreError(err, OperationType.CREATE, path);
        }
      }
      setLogMessage(
        `Success! Safely saved ${successCount} verified listings. Alert pipelines evaluated!`,
      );
      setHarvestedPreviews([]);
      setActiveTab("listings");
    } catch (err: unknown) {
      setLogMessage(`Commit halted: ${getErrorMessage(err)}`);
    }
  };

  // Exports specific property data straight to user's Google Sheet
  const exportListingToGoogleSheet = async (prop: ListingProperty) => {
    if (!accessToken) {
      setLogMessage("Google Workspace token expired or offline. Log in first.");
      return;
    }

    setSheetsExportingPropId(prop.id);
    setLogMessage(`Exporting Listing (${prop.title}) to Google Sheets spreadsheet...`);

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
      setLogMessage(`Logged successfully to Google Sheet! URL: ${data.url}`);
    } catch (err: unknown) {
      console.error(err);
      setLogMessage(`Sheets Integration Error: ${getErrorMessage(err)}`);
    } finally {
      setSheetsExportingPropId(null);
    }
  };

  // Schedules viewing appointment / tour automatically into Google Calendar
  const bookCalendarViewingEvent = async (prop: ListingProperty) => {
    if (!accessToken) {
      setLogMessage("Workspace token offline. Please connect Google Workspace first.");
      return;
    }
    if (!calendarEventTime) {
      setLogMessage("Please specify date and time for the viewing tour first.");
      return;
    }

    const confirmed = window.confirm(
      `Schedule showing appointment for "${prop.title}" in your Google Calendar?`,
    );
    if (!confirmed) return;

    setCalendarSchedulingPropId(prop.id);
    setLogMessage(`Booking viewing on Google Calendar for ${calendarEventTime}...`);

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

      setLogMessage(`Calendar event created successfully! Access standard link: ${data.htmlLink}`);
      // Clear scheduling inputs
      setCalendarEventTime("");
    } catch (err: unknown) {
      console.error(err);
      setLogMessage(`Calendar Integration Error: ${getErrorMessage(err)}`);
    } finally {
      setCalendarSchedulingPropId(null);
    }
  };

  // Create real-time search match alert criterion
  const handleCreateAlert = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!newAlertName) return;

    const alertId = `alert_${Date.now()}`;
    const path = `alerts/${alertId}`;

    const alertData: PropertyAlert = {
      id: alertId,
      userId: user.uid,
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
      setLogMessage(
        `Successfully initialized automated matcher: "${alertData.name}". Monitoring incoming streams.`,
      );
    } catch (err: unknown) {
      handleFirestoreError(err, OperationType.CREATE, path);
    }
  };

  // Delete an active alert query
  const handleDeleteAlert = async (alertId: string) => {
    if (!user) return;
    const path = `alerts/${alertId}`;
    try {
      await deleteDoc(doc(db, "alerts", alertId));
      setLogMessage("Muted search matched alert monitor.");
    } catch (err: unknown) {
      handleFirestoreError(err, OperationType.DELETE, path);
    }
  };

  // Delete user-backfilled or scanned listings
  const handleDeleteProperty = async (propId: string) => {
    if (!user) return;
    const path = `properties/${propId}`;
    try {
      await deleteDoc(doc(db, "properties", propId));
      setLogMessage("Property listing deleted successfully.");
    } catch (err: unknown) {
      handleFirestoreError(err, OperationType.DELETE, path);
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
        setRecentMatch({
          property,
          alertName: alert.name,
        });
        // Clear toast notification after 10 seconds
        setTimeout(() => {
          setRecentMatch(null);
        }, 10000);
      }
    });
  };

  // Filtering calculations
  const cities = Array.from(new Set(properties.map((p) => p.city)));
  const filteredProperties = properties.filter((prop) => {
    const matchesSearch =
      prop.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      prop.address.toLowerCase().includes(searchTerm.toLowerCase()) ||
      prop.city.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesCity = cityFilter === "All" || prop.city === cityFilter;

    return matchesSearch && matchesCity;
  });

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
              Realty
            </span>

            {/* Primary Inner Navigation */}
            <nav className="flex hidden space-x-4 pl-8 lg:flex lg:space-x-8">
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
            {/* Status panel */}
            <ThemeControls />

            {authLoading ? (
              <Loader2 className="text-primary-500 h-5 w-5 animate-spin" />
            ) : user ? (
              <div className="flex items-center space-x-3">
                <UserAvatar user={user} />
                {!accessToken ? (
                  <GoogleSignInButton onClick={handleGoogleAuth} label="Connect Google" />
                ) : (
                  <button
                    onClick={handleLogout}
                    className="cursor-pointer rounded-full border border-stone-300 bg-white p-2 text-stone-600 shadow-sm transition hover:bg-stone-50 hover:text-stone-950 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-300 dark:hover:bg-stone-900 dark:hover:text-white"
                    title="Disconnect Google"
                  >
                    <LogOut className="h-4 w-4" />
                  </button>
                )}
              </div>
            ) : (
              <GoogleSignInButton onClick={handleGoogleAuth} label="Sign in with Google" />
            )}
          </div>
        </div>
      </header>

      {/* 2. REAL-TIME ALERT CONVULSIVE BANNER */}
      {recentMatch && (
        <div
          id="alert-toast"
          className="bg-primary-950 border-primary-500 animate-bounce border-y px-4 py-3.5 text-white shadow-xl shadow-stone-950/90"
        >
          <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 sm:flex-row">
            <div className="flex items-center space-x-3">
              <div className="bg-primary-400 animate-pulse rounded-full p-2 text-stone-950 shadow-inner">
                <Bell className="h-5 w-5" />
              </div>
              <div>
                <span className="text-primary-400 block font-mono text-xs font-bold tracking-wider uppercase">
                  ALERT TRIGGER MATCH: "{recentMatch.alertName}"
                </span>
                <span className="mt-0.5 block text-xs font-medium text-stone-900 dark:text-stone-200">
                  Extracted listing match: {recentMatch.property.title} in{" "}
                  {recentMatch.property.city} — ${recentMatch.property.price.toLocaleString()} (
                  {recentMatch.property.beds}b/{recentMatch.property.baths}b)
                </span>
              </div>
            </div>
            <button
              onClick={() => {
                setActiveTab("listings");
                setSearchTerm(recentMatch.property.title);
              }}
              className="text-primary-950 hover:bg-primary-50 cursor-pointer rounded bg-white px-4 py-1.5 text-xs font-bold shadow transition"
            >
              Inspect Lead
            </button>
          </div>
        </div>
      )}

      {/* 3. HERO DESCRIPTION PANEL */}
      <main className="mx-auto w-full max-w-7xl flex-grow px-4 py-8 sm:px-6 lg:px-8">
        {/* SYSTEM STATUS STATUS LOGGER */}
        {logMessage && (
          <div className="mb-6 flex items-center justify-between rounded-lg border border-stone-200 bg-white p-3.5 font-mono text-xs text-stone-700 transition-all dark:border-stone-800 dark:bg-stone-900/80 dark:text-stone-300">
            <span className="flex items-center space-x-2 text-[11px] leading-relaxed">
              <span className="bg-primary-400 h-2 w-2 shrink-0 animate-pulse rounded-full" />
              <span>LOG: {logMessage}</span>
            </span>
            <button
              onClick={() => setLogMessage("")}
              className="ml-3 text-stone-500 transition hover:text-white"
            >
              ✕
            </button>
          </div>
        )}

        {/* 5. TAB VIEW CONTAINER ROUTING */}
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
                  className="focus:border-primary-500 rounded-lg border border-stone-200 bg-stone-50 p-2 text-xs font-semibold text-stone-900 focus:outline-none dark:border-stone-800 dark:bg-stone-950 dark:text-stone-300"
                >
                  <option value="All">All Cities</option>
                  {cities.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <ListingsGrid
              properties={filteredProperties}
              onExportToSheet={exportListingToGoogleSheet}
              onScheduleViewing={bookCalendarViewingEvent}
              onDeleteProperty={handleDeleteProperty}
              sheetsExportingPropId={sheetsExportingPropId}
              calendarSchedulingPropId={calendarSchedulingPropId}
              calendarEventTime={calendarEventTime}
              onCalendarEventTimeChange={setCalendarEventTime}
              hasWorkspaceAccess={Boolean(user && accessToken)}
            />
          </div>
        )}

        {activeTab === "docs" && <DocsView />}
        {activeTab === "cma" && <CMAView properties={properties} />}
        {activeTab === "wizard" && <AlertsWizardView />}

        {activeTab === "harvester" && (
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
            {/* HARVESTER CONTROL OPTIONS */}
            <div className="space-y-6 lg:col-span-4">
              {/* OPTIONS BOX 1: GMAIL SCANNER */}
              <div className="space-y-5 rounded-2xl border border-stone-200 bg-white p-6 shadow-lg dark:border-stone-800 dark:bg-stone-900">
                <div className="flex items-center space-x-2 border-b border-stone-200 pb-4 dark:border-stone-800">
                  <Mail className="text-primary-400 h-5 w-5" />
                  <h2 className="text-sm font-bold text-white">Gmail Alert Harvester</h2>
                </div>

                {!user || !accessToken ? (
                  <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-4 text-center text-amber-300">
                    <AlertTriangle className="mx-auto mb-2 h-8 w-8 animate-bounce text-amber-400" />
                    <span className="mb-1 block text-xs font-bold">
                      Google Workspace Auth Required
                    </span>
                    <p className="mb-4 text-[11px] leading-relaxed text-stone-400">
                      Realty Monitor requires secure OAuth permission to verify and safely parse
                      alert emails of listings directly from your inbox. No data is stored outside
                      your account.
                    </p>
                    <button
                      onClick={handleGoogleAuth}
                      className="bg-primary-600 hover:bg-primary-500 border-primary-500 w-full cursor-pointer rounded border px-4 py-2 font-mono text-xs font-semibold text-white shadow transition"
                    >
                      Authorize Google Services
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div>
                      <label className="mb-1.5 block font-mono text-[11px] tracking-wider text-stone-400 uppercase">
                        Gmail Query Filter
                      </label>
                      <input
                        type="text"
                        value={gmailQuery}
                        onChange={(e) => setGmailQuery(e.target.value)}
                        placeholder="e.g. subject:Redfin, subject:Zillow"
                        className="w-full rounded border border-stone-200 bg-stone-50 p-2.5 font-mono text-xs text-stone-900 dark:border-stone-800 dark:bg-stone-950 dark:text-stone-200"
                      />
                    </div>

                    <div>
                      <label className="mb-1.5 block font-mono text-[11px] tracking-wider text-stone-400 uppercase">
                        Search Limit (Emails count)
                      </label>
                      <select
                        value={gmailMaxResults}
                        onChange={(e) => setGmailMaxResults(parseInt(e.target.value))}
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
                      className="bg-primary-600 hover:bg-primary-500 border-primary-500 flex w-full cursor-pointer items-center justify-center gap-1.5 rounded border p-3 font-mono text-xs font-bold text-stone-950 shadow-md transition disabled:opacity-40"
                    >
                      {isScanningGmail ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin text-stone-950" />
                          <span>Harvesting Real Alerts...</span>
                        </>
                      ) : (
                        <>
                          <Mail className="h-4 w-4 text-stone-950" />
                          <span>Scan &amp; Harvest Gmail Inbox</span>
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>

              {/* OPTIONS BOX 2: DIRECT COPY-PASTER */}
              <div className="space-y-4 rounded-2xl border border-stone-200 bg-white p-6 shadow-lg dark:border-stone-800 dark:bg-stone-900">
                <div className="flex items-center space-x-2 border-b border-stone-200 pb-3 dark:border-stone-800">
                  <FileText className="h-5 w-5 text-blue-400" />
                  <h2 className="text-sm font-bold text-white">Direct Raw Alert Parser</h2>
                </div>

                <p className="text-[11px] leading-relaxed text-stone-400">
                  Pasted the contents of any real-estate alert email, copied webpage listing
                  snippet, or MLS descriptions. Gemini will structure it beautifully with 0%
                  hallucinatory metrics!
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
                    <Sparkles className="text-primary-400 h-5 w-5" />
                    <h2 className="font-sans text-sm font-bold text-white">
                      Sourced Listings Inbox Buffer
                    </h2>
                  </div>
                  {harvestedPreviews.length > 0 && user && (
                    <button
                      onClick={commitListingsToFirestore}
                      className="bg-primary-600 hover:bg-primary-500 border-primary-500 flex cursor-pointer items-center space-x-1 rounded border px-3 py-1.5 text-xs font-bold text-stone-950 shadow transition"
                    >
                      <PlusCircle className="h-3.5 w-3.5 text-stone-950" />
                      <span>Commit {harvestedPreviews.length} Sourced row to database</span>
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
                  <div className="max-h-[480px] space-y-4 overflow-y-auto pr-2">
                    {harvestedPreviews.map((item, idx) => (
                      <div
                        key={idx}
                        className="flex flex-col items-start justify-between gap-4 rounded-xl border border-stone-200 bg-stone-50 p-3.5 sm:flex-row sm:items-center dark:border-stone-800 dark:bg-stone-950"
                      >
                        <div className="flex items-center space-x-3.5">
                          <div className="h-14 w-14 shrink-0 overflow-hidden rounded border border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900">
                            <img
                              src={item.imageUrl}
                              alt={item.title}
                              className="h-full w-full object-cover"
                            />
                          </div>
                          <div>
                            <h4 className="text-xs leading-tight font-bold text-white">
                              {item.title}
                            </h4>
                            <span className="mt-0.5 block font-mono text-[11px] text-stone-400">
                              {item.address}, {item.city}
                            </span>
                            <span className="mt-1 block font-mono text-[10px] text-stone-500">
                              Beds: {item.beds} | Baths: {item.baths} | Size: {item.sqft} sqft
                            </span>
                          </div>
                        </div>

                        <div className="flex w-full shrink-0 items-center justify-between border-t border-stone-200 pt-2 text-right sm:w-auto sm:flex-col sm:items-end sm:border-t-0 sm:pt-0 dark:border-stone-800">
                          <span className="text-primary-400 block font-mono text-sm font-bold">
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
                <h2 className="text-sm font-bold text-white">Create Lead Monitor</h2>
              </div>

              {!user ? (
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
                      placeholder="e.g. Budget Properties Austin"
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
                      placeholder="e.g. Austin"
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

            {/* LIVE ACTIVE ALERTS ROW MATCH LISTING */}
            <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-lg lg:col-span-8 dark:border-stone-800 dark:bg-stone-900">
              <div className="mb-4 flex items-center justify-between border-b border-stone-200 pb-4 dark:border-stone-800">
                <span className="font-sans text-sm font-bold text-white">
                  Active Monitoring Queries
                </span>
                <span className="font-mono text-[10px] text-stone-500 uppercase">
                  Real-time evaluation rules
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
                    No active alert triggers configured in the tracker query systems yet. Keep
                    watching!
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
                          <h4 className="font-mono text-xs font-bold tracking-wider text-white uppercase">
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
                        <button
                          onClick={() => handleDeleteAlert(a.id)}
                          className="flex cursor-pointer items-center space-x-1 font-mono text-[11px] text-red-400 transition hover:text-red-300"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          <span>Mute Monitor</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* FOOTER */}
      <footer className="mt-12 border-t border-stone-200 bg-stone-100/40 py-6 text-center dark:border-stone-900 dark:bg-stone-950/40">
        <span className="block font-mono text-[10px] text-stone-500">
          &copy; 2026 Realty Monitor. Created and deployed with precise, ethical workspace
          standards.
        </span>
      </footer>
    </div>
  );
}
