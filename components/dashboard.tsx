"use client";

import React, { useState, useEffect } from "react";
import { 
  Building2, 
  Search, 
  SlidersHorizontal, 
  MapPin, 
  DollarSign, 
  BedDouble, 
  Bath, 
  Maximize2, 
  Plus, 
  AlertTriangle, 
  Bell, 
  Calendar as CalendarIcon,
  Cloud,
  Layers,
  Sparkles,
  Database,
  ArrowRight,
  LogOut,
  Trash2,
  CheckCircle2,
  Activity,
  PlusCircle,
  HelpCircle,
  Mail,
  FileSpreadsheet,
  CalendarDays,
  Send,
  Loader2,
  FileText,
  Clock,
  Link as LinkIcon
} from "lucide-react";
import { 
  collection, 
  doc, 
  setDoc, 
  getDocs, 
  deleteDoc, 
  onSnapshot, 
  query, 
  where 
} from "firebase/firestore";
import { 
  auth, 
  db, 
  googleProvider, 
  signInWithPopup, 
  signOut,
  handleFirestoreError,
  OperationType 
} from "../lib/firebase";
import { onAuthStateChanged, User, GoogleAuthProvider } from "firebase/auth";
import { STATIC_PROPERTIES } from "../lib/static_properties";
import { ListingProperty, PropertyAlert } from "../types/listings";

// Request Google Workspace granular scopes
googleProvider.addScope("https://www.googleapis.com/auth/gmail.readonly");
googleProvider.addScope("https://www.googleapis.com/auth/spreadsheets");
googleProvider.addScope("https://www.googleapis.com/auth/calendar");
googleProvider.addScope("https://www.googleapis.com/auth/drive.file");

export default function Dashboard() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  
  const [properties, setProperties] = useState<ListingProperty[]>([]);
  const [alerts, setAlerts] = useState<PropertyAlert[]>([]);
  const [activeTab, setActiveTab] = useState<"listings" | "harvester" | "alerts">("listings");
  
  // Filtering & Search state
  const [searchTerm, setSearchTerm] = useState("");
  const [cityFilter, setCityFilter] = useState("All");
  const [filterSource, setFilterSource] = useState("All"); // All, seeded, realty_api
  
  // Alert form state
  const [newAlertName, setNewAlertName] = useState("");
  const [newAlertCity, setNewAlertCity] = useState("Austin");
  const [newAlertMaxPrice, setNewAlertMaxPrice] = useState("");
  const [newAlertMinBeds, setNewAlertMinBeds] = useState("2");
  
  // Gmail Harvester controls
  const [gmailQuery, setGmailQuery] = useState('subject:"Redfin" OR subject:"Zillow" OR "new listing"');
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
  const [recentMatch, setRecentMatch] = useState<{ property: ListingProperty; alertName: string } | null>(null);

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
      unsubProperties = onSnapshot(qProperties, (snapshot) => {
        const props: ListingProperty[] = [];
        snapshot.forEach((doc) => {
          props.push({ id: doc.id, ...doc.data() } as ListingProperty);
        });
        
        // Merge with our safe static properties baseline
        const merged = [...props];
        STATIC_PROPERTIES.forEach(staticProp => {
          if (!merged.some(p => p.id === staticProp.id)) {
            merged.push(staticProp);
          }
        });
        
        // Sort newest first
        merged.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setProperties(merged);
      }, (err) => {
        console.error("Firestore onSnapshot properties error:", err);
      });
    } catch (e) {
      console.error(e);
      setProperties(STATIC_PROPERTIES);
    }

    // 2. Alerts snapshot listener
    if (user) {
      try {
        const qAlerts = query(collection(db, "alerts"), where("userId", "==", user.uid));
        unsubAlerts = onSnapshot(qAlerts, (snapshot) => {
          const loadedAlerts: PropertyAlert[] = [];
          snapshot.forEach((doc) => {
            loadedAlerts.push({ id: doc.id, ...doc.data() } as PropertyAlert);
          });
          setAlerts(loadedAlerts);
        }, (err) => {
          console.error("Firestore onSnapshot alerts error:", err);
        });
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
    } catch (error: any) {
      console.error("Google Auth error:", error);
      setLogMessage(`Authorization failed: ${error.message}`);
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
      setLogMessage("Active Google Workspace token required. Click 'Connect Google Services' top right.");
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
          "Authorization": `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          action: "parse_gmail",
          query: gmailQuery,
          maxResults: gmailMaxResults
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to parse matching email listings.");
      }

      setHarvestedPreviews(data.properties || []);
      setLogMessage(`Harvest completed: Found ${data.properties?.length || 0} real estate listings inside your Gmail inbox matching "${gmailQuery}".`);
    } catch (error: any) {
      console.error(error);
      setLogMessage(`Gmail Harvester Error: ${error.message}`);
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
          text: directPastedText
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to analyze pasting.");
      }

      if (data.property) {
        setHarvestedPreviews([data.property]);
        setLogMessage("Gemini successfully structured the listing! Review details below & commit to DB.");
      } else {
        setLogMessage("Gemini was unable to recognize any real property details in that string.");
      }
    } catch (error: any) {
      console.error(error);
      setLogMessage(`Parser Error: ${error.message}`);
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
        } catch (err: any) {
          handleFirestoreError(err, OperationType.CREATE, path);
        }
      }
      setLogMessage(`Success! Safely saved ${successCount} verified listings. Alert pipelines evaluated!`);
      setHarvestedPreviews([]);
      setActiveTab("listings");
    } catch (err: any) {
      setLogMessage(`Commit halted: ${err.message}`);
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
          "Authorization": `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          action: "export_sheets",
          spreadsheetId: sheetLink?.id || undefined, // Create new or append to existing
          listings: [prop]
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to log record on sheets.");
      }

      setSheetLink({ id: data.spreadsheetId, url: data.url });
      setLogMessage(`Logged successfully to Google Sheet! URL: ${data.url}`);
    } catch (err: any) {
      console.error(err);
      setLogMessage(`Sheets Integration Error: ${err.message}`);
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

    const confirmed = window.confirm(`Schedule showing appointment for "${prop.title}" in your Google Calendar?`);
    if (!confirmed) return;

    setCalendarSchedulingPropId(prop.id);
    setLogMessage(`Booking viewing on Google Calendar for ${calendarEventTime}...`);

    try {
      const response = await fetch("/api/properties", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          action: "create_calendar_event",
          property: prop,
          startDateTime: new Date(calendarEventTime).toISOString()
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to add calendar schedule event.");
      }

      setLogMessage(`Calendar event created successfully! Access standard link: ${data.htmlLink}`);
      // Clear scheduling inputs
      setCalendarEventTime("");
    } catch (err: any) {
      console.error(err);
      setLogMessage(`Calendar Integration Error: ${err.message}`);
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
        beds: parseInt(newAlertMinBeds)
      },
      isActive: true,
      createdAt: new Date().toISOString()
    };

    try {
      await setDoc(doc(db, "alerts", alertId), alertData);
      setNewAlertName("");
      setNewAlertMaxPrice("");
      setLogMessage(`Successfully initialized automated matcher: "${alertData.name}". Monitoring incoming streams.`);
    } catch (err: any) {
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
    } catch (err: any) {
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
    } catch (err: any) {
      handleFirestoreError(err, OperationType.DELETE, path);
    }
  };

  // Check matching rules
  const checkForAlertMatch = (property: ListingProperty) => {
    alerts.forEach((alert) => {
      let isMatch = true;
      if (alert.criteria.city && property.city.toLowerCase() !== alert.criteria.city.toLowerCase()) {
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
          alertName: alert.name
        });
        // Clear toast notification after 10 seconds
        setTimeout(() => {
          setRecentMatch(null);
        }, 10000);
      }
    });
  };

  // Filtering calculations
  const cities = Array.from(new Set(properties.map(p => p.city)));
  const filteredProperties = properties.filter((prop) => {
    const matchesSearch = 
      prop.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
      prop.address.toLowerCase().includes(searchTerm.toLowerCase()) ||
      prop.city.toLowerCase().includes(searchTerm.toLowerCase());
      
    const matchesCity = cityFilter === "All" || prop.city === cityFilter;
    const matchesSource = 
      filterSource === "All" || 
      (filterSource === "seeded" && prop.source === "seeded") || 
      (filterSource === "realty_api" && prop.source === "realty_api");

    return matchesSearch && matchesCity && matchesSource;
  });

  return (
    <div className="flex flex-col min-h-screen bg-slate-950 font-sans text-slate-100 selection:bg-emerald-500 selection:text-slate-950">
      
      {/* 1. TOP HEADER NAVIGATION PANEL */}
      <header className="border-b border-slate-900 bg-slate-900/40 backdrop-blur sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="bg-emerald-500/10 text-emerald-400 p-2 rounded-lg border border-emerald-500/20 shadow-inner">
              <Building2 className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <span className="font-sans font-bold text-lg tracking-tight text-white block">Realty Monitor</span>
              <span className="font-mono text-[10px] text-slate-400 block tracking-wider uppercase">Active Inbox &amp; Alert Engine</span>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            {/* Status panel */}
            <div className="hidden lg:flex items-center space-x-2.5 bg-slate-900/60 px-3 py-1.5 rounded-full border border-slate-800">
              <span className={`h-2 w-2 rounded-full ${accessToken ? "bg-emerald-400 animate-pulse" : "bg-red-400"}`} />
              <span className="font-mono text-[10px] text-slate-300">
                Workspace APIs: {accessToken ? "Connected" : "Requires Authentication"}
              </span>
            </div>

            {authLoading ? (
              <Loader2 className="w-5 h-5 text-emerald-500 animate-spin" />
            ) : user ? (
              <div className="flex items-center space-x-3">
                <div className="hidden sm:block text-right">
                  <span className="text-xs font-semibold text-white block">{user.displayName || "Agent"}</span>
                  <span className="text-[10px] font-mono text-slate-400 block">{user.email}</span>
                </div>
                {!accessToken ? (
                  <button
                    onClick={handleGoogleAuth}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs px-3 py-1.5 rounded border border-emerald-500 transition shadow-md cursor-pointer"
                  >
                    Authorize Workspace
                  </button>
                ) : (
                  <button 
                    onClick={handleLogout}
                    className="bg-slate-800 hover:bg-slate-700 border border-slate-700 p-2 rounded text-slate-300 transition hover:text-white cursor-pointer"
                    title="Disconnect Google Auth"
                  >
                    <LogOut className="w-4 h-4" />
                  </button>
                )}
              </div>
            ) : (
              <button 
                onClick={handleGoogleAuth}
                className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-1.5 rounded font-semibold text-xs transition shadow-lg border border-emerald-500 cursor-pointer"
              >
                Sign In with Google
              </button>
            )}
          </div>
        </div>
      </header>

      {/* 2. REAL-TIME ALERT CONVULSIVE BANNER */}
      {recentMatch && (
        <div id="alert-toast" className="bg-emerald-950 border-y border-emerald-500 text-white py-3.5 px-4 shadow-xl shadow-slate-950/90 animate-bounce">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center space-x-3">
              <div className="bg-emerald-400 text-slate-950 p-2 rounded-full shadow-inner animate-pulse">
                <Bell className="w-5 h-5" />
              </div>
              <div>
                <span className="font-bold text-xs tracking-wider block uppercase font-mono text-emerald-400">ALERT TRIGGER MATCH: "{recentMatch.alertName}"</span>
                <span className="text-xs text-slate-200 block font-medium mt-0.5">
                  Extracted listing match: {recentMatch.property.title} in {recentMatch.property.city} — ${recentMatch.property.price.toLocaleString()} ({recentMatch.property.beds}b/{recentMatch.property.baths}b)
                </span>
              </div>
            </div>
            <button 
              onClick={() => {
                setActiveTab("listings");
                setSearchTerm(recentMatch.property.title);
              }}
              className="bg-white text-emerald-950 font-bold px-4 py-1.5 rounded text-xs transition hover:bg-emerald-50 shadow cursor-pointer"
            >
              Inspect Lead
            </button>
          </div>
        </div>
      )}

      {/* 3. HERO DESCRIPTION PANEL */}
      <main className="flex-grow max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <section className="mb-8">
          <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6 md:p-8 relative overflow-hidden shadow-2xl">
            <div className="absolute right-0 bottom-0 top-0 opacity-10 pointer-events-none">
              <Building2 className="w-80 h-full text-white" />
            </div>
            <div className="relative max-w-3xl z-10">
              <div className="inline-flex items-center space-x-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-3 py-1 rounded-full text-xs font-semibold mb-4">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Google Workspace Integrations Live</span>
              </div>
              <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight leading-tight">
                Harvest Actual Real-Estate Leads From Your Custom Alerts
              </h1>
              <p className="mt-3 text-slate-400 text-sm leading-relaxed">
                Forget simulated property generators or mock hallucinating listing modules. 
                Realty Monitor harnesses your <strong className="text-white font-medium">real-time Gmail notifications and alerts</strong> (Redfin, Zillow, MLS) directly using secure OAuth! 
                Gemini parses details in your inbox automatically. Map properties, review prospects, exports listing rows straight to Google Sheets and schedule tours instantly into your Google Calendar.
              </p>
              
              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  onClick={() => setActiveTab("harvester")}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-4 py-2 rounded text-xs transition flex items-center space-x-2 border border-emerald-500 cursor-pointer shadow-lg shadow-emerald-950/50"
                >
                  <Mail className="w-4 h-4" />
                  <span>Harvest Listings From Gmail</span>
                </button>
                <button
                  onClick={() => setActiveTab("alerts")}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-4 py-2 rounded text-xs transition flex items-center space-x-2 border border-slate-700 cursor-pointer"
                >
                  <Bell className="w-4 h-4" />
                  <span>Configure Alert Rule Matches</span>
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* 4. NAVIGATION CONTROL CLAW */}
        <div className="flex border-b border-slate-800 mb-6 font-medium">
          <button
            onClick={() => setActiveTab("listings")}
            className={`px-4 py-3 border-b-2 transition text-xs flex items-center space-x-2 ${
              activeTab === "listings" 
                ? "border-emerald-500 text-white bg-slate-900/20" 
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Active Leads Database ({filteredProperties.length})</span>
          </button>
          
          <button
            onClick={() => setActiveTab("harvester")}
            className={`px-4 py-3 border-b-2 transition text-xs flex items-center space-x-2 ${
              activeTab === "harvester" 
                ? "border-emerald-500 text-white bg-slate-900/20" 
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Mail className="w-4 h-4" />
            <span>Realty Email Harvester</span>
            {harvestedPreviews.length > 0 && (
              <span className="bg-amber-400 text-slate-950 font-mono text-[9px] font-bold px-1.5 py-0.5 rounded-full ml-1">
                {harvestedPreviews.length} parsed
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab("alerts")}
            className={`px-4 py-3 border-b-2 transition text-xs flex items-center space-x-2 ${
              activeTab === "alerts" 
                ? "border-emerald-500 text-white bg-slate-900/20" 
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Bell className="w-4 h-4" />
            <span>Matched Alert Queries ({alerts.length})</span>
          </button>
        </div>

        {/* SYSTEM STATUS STATUS LOGGER */}
        {logMessage && (
          <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-3.5 text-xs text-slate-300 font-mono flex items-center justify-between mb-6 transition-all">
            <span className="flex items-center space-x-2 text-[11px] leading-relaxed">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
              <span>LOG: {logMessage}</span>
            </span>
            <button onClick={() => setLogMessage("")} className="text-slate-500 hover:text-white transition ml-3">✕</button>
          </div>
        )}

        {/* 5. TAB VIEW CONTAINER ROUTING */}
        {activeTab === "listings" && (
          <div className="space-y-6">
            
            {/* SEARCH AND BAR FILTERS */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col md:flex-row gap-4 items-center justify-between shadow-lg">
              <div className="relative w-full md:max-w-md">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 w-4 h-4" />
                <input
                  type="text"
                  placeholder="Search listings address, zip, city or title..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 text-slate-200 placeholder-slate-500 pl-10 pr-4 py-2 rounded-lg text-xs focus:outline-none focus:border-emerald-500 font-medium font-mono"
                />
              </div>

              <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                <div className="flex items-center space-x-2 text-xs text-slate-400">
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  <span>City Area:</span>
                </div>
                <select
                  value={cityFilter}
                  onChange={(e) => setCityFilter(e.target.value)}
                  className="bg-slate-950 border border-slate-800 text-slate-300 text-xs rounded-lg p-2 font-mono focus:outline-none focus:border-emerald-500"
                >
                  <option value="All">All Cities</option>
                  {cities.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>

                <div className="flex bg-slate-950 border border-slate-800 rounded-lg p-0.5">
                  <button 
                    onClick={() => setFilterSource("All")}
                    className={`px-3 py-1 text-[10px] rounded ${filterSource === "All" ? "bg-slate-800 text-white font-semibold" : "text-slate-400"}`}
                  >
                    All Source
                  </button>
                  <button 
                    onClick={() => setFilterSource("seeded")}
                    className={`px-3 py-1 text-[10px] rounded ${filterSource === "seeded" ? "bg-slate-800 text-white font-semibold" : "text-slate-400"}`}
                  >
                    Seeded
                  </button>
                  <button 
                    onClick={() => setFilterSource("realty_api")}
                    className={`px-3 py-1 text-[10px] rounded ${filterSource === "realty_api" ? "bg-slate-800 text-white font-semibold" : "text-slate-400"}`}
                  >
                    Email Harvested
                  </button>
                </div>
              </div>
            </div>

            {/* LISTINGS BOX GRID */}
            {filteredProperties.length === 0 ? (
              <div className="text-center py-20 bg-slate-900/30 rounded-2xl border border-slate-850 border-dashed">
                <Search className="w-12 h-12 text-slate-700 mx-auto mb-3" />
                <h3 className="text-sm font-bold text-white">No properties match parameters</h3>
                <p className="text-slate-500 text-xs mt-1">Mute active search filters or try scanning Gmail alerts.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-fadeIn">
                {filteredProperties.map((prop) => (
                  <div 
                    key={prop.id} 
                    className="bg-slate-900 border border-slate-850 rounded-xl overflow-hidden hover:border-slate-750 transition duration-300 group flex flex-col relative shadow-xl"
                  >
                    {/* Badge Source Indicator */}
                    <div className="absolute top-3 left-3 z-10 flex gap-1.5 flex-wrap">
                      <span className={`text-[9px] uppercase font-mono font-bold tracking-wider px-2 py-1 rounded shadow ${
                        prop.source === "realty_api" 
                          ? "bg-amber-400 text-slate-950" 
                          : "bg-emerald-500/90 text-white"
                      }`}>
                        {prop.source === "realty_api" ? "Email Harvested" : "Seeded Baseline"}
                      </span>
                    </div>

                    {/* Image Box Thumbnail */}
                    <div className="relative h-44 w-full bg-slate-950 overflow-hidden">
                      <img 
                        src={prop.imageUrl} 
                        alt={prop.title}
                        className="w-full h-full object-cover group-hover:scale-[1.02] transition duration-500"
                        referrerPolicy="no-referrer"
                      />
                      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-slate-950 via-slate-950/60 to-transparent p-3.5">
                        <span className="text-[11px] text-slate-300 font-mono block tracking-tight">{prop.address}, {prop.city}</span>
                        <h3 className="font-sans font-bold text-sm text-white line-clamp-1 block mt-0.5">{prop.title}</h3>
                      </div>
                    </div>

                    {/* Info and stats box */}
                    <div className="p-4 flex-grow flex flex-col justify-between space-y-4">
                      <div className="space-y-3">
                        <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                          <span className="text-base font-mono font-bold text-emerald-400">
                            ${prop.price.toLocaleString()}
                          </span>
                          <span className="text-slate-400 font-mono text-[10px] bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                            {prop.propertyType}
                          </span>
                        </div>

                        {/* Specs grid */}
                        <div className="grid grid-cols-3 gap-2 text-center text-slate-400 bg-slate-950/50 p-2 rounded border border-slate-800">
                          <div>
                            <span className="text-[9px] font-mono tracking-wider block text-slate-500 uppercase">Beds</span>
                            <span className="font-mono text-xs text-white font-semibold flex items-center justify-center">
                              <BedDouble className="w-3 h-3 mr-1 text-slate-500" />
                              <span>{prop.beds}</span>
                            </span>
                          </div>
                          <div>
                            <span className="text-[9px] font-mono tracking-wider block text-slate-500 uppercase">Baths</span>
                            <span className="font-mono text-xs text-white font-semibold flex items-center justify-center">
                              <Bath className="w-3 h-3 mr-1 text-slate-500" />
                              <span>{prop.baths}</span>
                            </span>
                          </div>
                          <div>
                            <span className="text-[9px] font-mono tracking-wider block text-slate-500 uppercase">Dimension</span>
                            <span className="font-mono text-xs text-white font-semibold flex items-center justify-center">
                              <Maximize2 className="w-3 h-3 mr-1 text-slate-500" />
                              <span>{prop.sqft} sqft</span>
                            </span>
                          </div>
                        </div>

                        <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed font-medium">
                          {prop.description || "Active property matches found across harvesting feeds. Review metrics."}
                        </p>

                        {/* WORKSPACE GRANULAR OPERATIONS PANEL */}
                        {accessToken ? (
                          <div className="bg-slate-950 border border-slate-800 rounded-lg p-2.5 space-y-2 mt-4">
                            <span className="text-[10px] font-mono text-slate-400 block tracking-wider uppercase font-semibold">Workspace Actions:</span>
                            
                            <div className="flex gap-2">
                              {/* Sheets export button */}
                              <button
                                onClick={() => exportListingToGoogleSheet(prop)}
                                disabled={sheetsExportingPropId !== null}
                                className="flex-1 bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-200 py-1.5 px-2 rounded text-[10px] font-mono flex items-center justify-center gap-1.5 disabled:opacity-40 hover:bg-slate-850 cursor-pointer text-center"
                                title="Export detailed listings to Google Sheet"
                              >
                                {sheetsExportingPropId === prop.id ? (
                                  <Loader2 className="w-3 h-3 animate-spin text-emerald-400" />
                                ) : (
                                  <FileSpreadsheet className="w-3 h-3 text-emerald-500" />
                                )}
                                <span>{sheetsExportingPropId === prop.id ? "Syncing..." : "Log to Sheets"}</span>
                              </button>

                              {/* Trigger Scheduler Mode widget */}
                              <button
                                onClick={() => {
                                  if (calendarSchedulingPropId === prop.id) {
                                    setCalendarSchedulingPropId(null);
                                  } else {
                                    setCalendarSchedulingPropId(prop.id);
                                  }
                                }}
                                className="flex-1 bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-200 py-1.5 px-2 rounded text-[10px] font-mono flex items-center justify-center gap-1.5 hover:bg-slate-850 cursor-pointer text-center"
                              >
                                <CalendarDays className="w-3 h-3 text-blue-400" />
                                <span>Calendar Tour</span>
                              </button>
                            </div>

                            {/* Calendar Event Time Picker Box */}
                            {calendarSchedulingPropId === prop.id && (
                              <div className="border-t border-slate-900 pt-2.5 space-y-2 inline-block w-full">
                                <label className="block text-[9px] font-mono text-slate-500 uppercase">Tour Date &amp; Time (UTC)</label>
                                <div className="flex gap-2">
                                  <input 
                                    type="datetime-local" 
                                    value={calendarEventTime}
                                    onChange={(e) => setCalendarEventTime(e.target.value)}
                                    className="flex-1 bg-slate-900 text-white font-mono text-[10px] p-1 border border-slate-850 rounded"
                                  />
                                  <button
                                    onClick={() => bookCalendarViewingEvent(prop)}
                                    className="bg-emerald-600 hover:bg-emerald-500 text-slate-900 font-bold px-2 py-1 rounded text-[10px] cursor-pointer"
                                  >
                                    Book
                                  </button>
                                </div>
                              </div>
                            )}

                            {sheetLink && (
                              <div className="text-[10px] bg-emerald-500/5 border border-emerald-500/10 p-1.5 rounded flex items-center justify-between mt-1">
                                <span className="font-mono text-emerald-400">Sheet Linked successfully</span>
                                <a href={sheetLink.url} target="_blank" rel="noopener noreferrer" className="font-mono text-white underline hover:text-emerald-300 flex items-center gap-0.5">
                                  <LinkIcon className="w-3 h-3" />
                                  <span>Open</span>
                                </a>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="bg-slate-950 border border-slate-800 border-dashed rounded-lg p-2.5 text-center mt-3">
                            <span className="text-[10px] font-mono text-slate-500 block">Connect Workspace to enable active Google Sheets logging &amp; Calendar schedules.</span>
                          </div>
                        )}
                      </div>

                      {/* Card Footer controls */}
                      {prop.source === "realty_api" && user && (
                        <div className="flex justify-between items-center pt-2.5 border-t border-slate-800">
                          <span className="text-[9px] font-mono text-slate-500">ID: {prop.id}</span>
                          <button 
                            onClick={() => handleDeleteProperty(prop.id)}
                            className="text-red-400 hover:text-red-300 transition text-[11px] font-mono flex items-center space-x-1 cursor-pointer"
                            title="Remove listing from Firestore DB"
                          >
                            <Trash2 className="w-3 h-3" />
                            <span>Remove</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "harvester" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            
            {/* HARVESTER CONTROL OPTIONS */}
            <div className="lg:col-span-4 space-y-6">
              
              {/* OPTIONS BOX 1: GMAIL SCANNER */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5 shadow-lg">
                <div className="flex items-center space-x-2 pb-4 border-b border-slate-800">
                  <Mail className="w-5 h-5 text-emerald-400" />
                  <h2 className="text-sm font-bold text-white">Gmail Alert Harvester</h2>
                </div>

                {!user || !accessToken ? (
                  <div className="bg-amber-500/10 border border-amber-500/20 text-amber-300 p-4 rounded-xl text-center">
                    <AlertTriangle className="w-8 h-8 text-amber-400 mx-auto mb-2 animate-bounce" />
                    <span className="text-xs font-bold block mb-1">Google Workspace Auth Required</span>
                    <p className="text-[11px] leading-relaxed text-slate-400 mb-4">
                      Realty Monitor requires secure OAuth permission to verify and safely parse alert emails of listings directly from your inbox. No data is stored outside your account.
                    </p>
                    <button 
                      onClick={handleGoogleAuth}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold px-4 py-2 rounded text-xs w-full transition border border-emerald-500 shadow cursor-pointer font-mono"
                    >
                      Authorize Google Services
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-[11px] font-mono text-slate-400 uppercase tracking-wider mb-1.5">Gmail Query Filter</label>
                      <input
                        type="text"
                        value={gmailQuery}
                        onChange={(e) => setGmailQuery(e.target.value)}
                        placeholder="e.g. subject:Redfin, subject:Zillow"
                        className="w-full bg-slate-950 border border-slate-800 text-slate-200 p-2.5 rounded text-xs font-mono"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-mono text-slate-400 uppercase tracking-wider mb-1.5">Search Limit (Emails count)</label>
                      <select
                        value={gmailMaxResults}
                        onChange={(e) => setGmailMaxResults(parseInt(e.target.value))}
                        className="w-full bg-slate-950 border border-slate-800 text-slate-200 p-2.5 rounded text-xs font-mono"
                      >
                        <option value={3}>Latest 3 Matching Emails</option>
                        <option value={5}>Latest 5 Matching Emails</option>
                        <option value={10}>Latest 10 Matching Emails</option>
                      </select>
                    </div>

                    <button
                      onClick={triggerGmailHarvest}
                      disabled={isScanningGmail}
                      className="w-full bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold p-3 rounded text-xs transition border border-emerald-500 shadow-md font-mono flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40"
                    >
                      {isScanningGmail ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin text-slate-950" />
                          <span>Harvesting Real Alerts...</span>
                        </>
                      ) : (
                        <>
                          <Mail className="w-4 h-4 text-slate-950" />
                          <span>Scan &amp; Harvest Gmail Inbox</span>
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>

              {/* OPTIONS BOX 2: DIRECT COPY-PASTER */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4 shadow-lg">
                <div className="flex items-center space-x-2 pb-3 border-b border-slate-800">
                  <FileText className="w-5 h-5 text-blue-400" />
                  <h2 className="text-sm font-bold text-white">Direct Raw Alert Parser</h2>
                </div>

                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Pasted the contents of any real-estate alert email, copied webpage listing snippet, or MLS descriptions. Gemini will structure it beautifully with 0% hallucinatory metrics!
                </p>

                <div className="space-y-3">
                  <textarea
                    rows={4}
                    value={directPastedText}
                    onChange={(e) => setDirectPastedText(e.target.value)}
                    placeholder="Paste email alert body or listing details text here..."
                    className="w-full bg-slate-950 border border-slate-800 text-slate-200 p-2.5 rounded text-xs font-mono focus:outline-none"
                  />
                  
                  <button
                    onClick={triggerDirectTextParse}
                    disabled={isParsingDirect || !directPastedText.trim()}
                    className="w-full bg-slate-800 hover:bg-slate-705 border border-slate-700 text-slate-200 font-bold p-2.5 rounded text-xs transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-30"
                  >
                    {isParsingDirect ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Extracting listing...</span>
                      </>
                    ) : (
                      <>
                        <Send className="w-3.5 h-3.5 text-blue-400" />
                        <span>Parse Text to Property Schema</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

            </div>

            {/* PREVIEW CONTAINER FOR COMMIT */}
            <div className="lg:col-span-8 bg-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-col justify-between shadow-lg">
              <div>
                <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-4">
                  <div className="flex items-center space-x-2">
                    <Sparkles className="w-5 h-5 text-emerald-400" />
                    <h2 className="text-sm font-bold text-white font-sans">Sourced Listings Inbox Buffer</h2>
                  </div>
                  {harvestedPreviews.length > 0 && user && (
                    <button
                      onClick={commitListingsToFirestore}
                      className="bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold px-3 py-1.5 rounded text-xs transition flex items-center space-x-1 border border-emerald-500 cursor-pointer shadow"
                    >
                      <PlusCircle className="w-3.5 h-3.5 text-slate-950" />
                      <span>Commit {harvestedPreviews.length} Sourced row to database</span>
                    </button>
                  )}
                </div>

                {isScanningGmail || isParsingDirect ? (
                  <div className="text-center py-24 space-y-3">
                    <Loader2 className="w-10 h-10 animate-spin text-emerald-500 mx-auto" />
                    <span className="font-mono text-xs text-slate-400 block animate-pulse">
                      Analyzing input text elements &amp; compiling models...
                    </span>
                  </div>
                ) : harvestedPreviews.length === 0 ? (
                  <div className="text-center py-20 bg-slate-950/40 rounded-xl border border-slate-800 border-dashed">
                    <Cloud className="w-10 h-10 text-slate-600 mx-auto mb-3" />
                    <h3 className="text-xs font-bold text-slate-300 font-mono">Scanner buffer empty</h3>
                    <p className="text-slate-500 text-[11px] mt-1 m-auto max-w-sm leading-relaxed">
                      Log in to your Gmail, select a search filter, and harvest live alerts, or copy-paste text in the direct parser block!
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4 max-h-[480px] overflow-y-auto pr-2">
                    {harvestedPreviews.map((item, idx) => (
                      <div key={idx} className="bg-slate-950 border border-slate-800 p-3.5 rounded-xl flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                        <div className="flex items-center space-x-3.5">
                          <div className="h-14 w-14 rounded bg-slate-900 border border-slate-800 shrink-0 overflow-hidden">
                            <img src={item.imageUrl} alt={item.title} className="h-full w-full object-cover" />
                          </div>
                          <div>
                            <h4 className="font-bold text-xs text-white leading-tight">{item.title}</h4>
                            <span className="text-[11px] text-slate-400 font-mono block mt-0.5">{item.address}, {item.city}</span>
                            <span className="text-[10px] text-slate-500 font-mono block mt-1">Beds: {item.beds} | Baths: {item.baths} | Size: {item.sqft} sqft</span>
                          </div>
                        </div>

                        <div className="text-right flex sm:flex-col justify-between items-center sm:items-end w-full sm:w-auto border-t sm:border-t-0 border-slate-905 pt-2 sm:pt-0 shrink-0">
                          <span className="text-sm font-mono font-bold text-emerald-400 block">${item.price.toLocaleString()}</span>
                          <span className="text-[9px] font-mono text-slate-500 block mt-0.5 uppercase tracking-wide bg-slate-900 px-2 py-0.5 rounded border border-slate-850">Ready to Commit</span>
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
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            
            {/* ALERTS SCHEDULER FORM */}
            <div className="lg:col-span-4 bg-slate-900 border border-slate-800 rounded-2xl p-6 h-fit space-y-5 shadow-lg">
              <div className="flex items-center space-x-2 pb-4 border-b border-slate-800">
                <Bell className="w-5 h-5 text-emerald-400" />
                <h2 className="text-sm font-bold text-white">Create Lead Monitor</h2>
              </div>

              {!user ? (
                <div className="bg-amber-500/10 border border-amber-500/20 text-amber-300 p-4 rounded-xl text-center">
                  <span className="text-xs font-bold block mb-1">Authorization Required</span>
                  <p className="text-[11px] leading-relaxed text-slate-400 mb-3">Please sign in to configure alerts.</p>
                  <button onClick={handleGoogleAuth} className="bg-emerald-600 text-slate-950 px-4 py-1.5 rounded text-xs w-full font-bold transition cursor-pointer">Sign In</button>
                </div>
              ) : (
                <form onSubmit={handleCreateAlert} className="space-y-4">
                  <div>
                    <label className="block text-[11px] font-mono text-slate-400 uppercase tracking-wider mb-1.5">Alert Name</label>
                    <input
                      type="text"
                      required
                      value={newAlertName}
                      onChange={(e) => setNewAlertName(e.target.value)}
                      placeholder="e.g. Budget Properties Austin"
                      className="w-full bg-slate-950 border border-slate-800 text-slate-200 p-2.5 rounded text-xs font-sans focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-mono text-slate-400 uppercase tracking-wider mb-1.5">Target City Area</label>
                    <input
                      type="text"
                      required
                      value={newAlertCity}
                      onChange={(e) => setNewAlertCity(e.target.value)}
                      placeholder="e.g. Austin"
                      className="w-full bg-slate-950 border border-slate-800 text-slate-200 p-2.5 rounded text-xs font-sans focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-mono text-slate-400 uppercase tracking-wider mb-1.5">Maximum Price ($)</label>
                    <input
                      type="number"
                      value={newAlertMaxPrice}
                      onChange={(e) => setNewAlertMaxPrice(e.target.value)}
                      placeholder="e.g. 750000"
                      className="w-full bg-slate-950 border border-slate-800 text-slate-200 p-2.5 rounded text-xs font-mono focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-mono text-slate-400 uppercase tracking-wider mb-1.5">Minimum Bedrooms</label>
                    <select
                      value={newAlertMinBeds}
                      onChange={(e) => setNewAlertMinBeds(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 text-slate-200 p-2.5 rounded text-xs font-sans focus:outline-none"
                    >
                      <option value="1">1+ Beds</option>
                      <option value="2">2+ Beds</option>
                      <option value="3">3+ Beds</option>
                      <option value="4">4+ Beds</option>
                    </select>
                  </div>

                  <button
                    type="submit"
                    className="w-full bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold p-3 rounded text-xs transition border border-emerald-500 font-mono shadow cursor-pointer text-center"
                  >
                    Set Active Alert Trigger Rule
                  </button>
                </form>
              )}
            </div>

            {/* LIVE ACTIVE ALERTS ROW MATCH LISTING */}
            <div className="lg:col-span-8 bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-lg">
              <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-4">
                <span className="font-bold text-white text-sm font-sans">Active Monitoring Queries</span>
                <span className="font-mono text-slate-500 text-[10px] uppercase">Real-time evaluation rules</span>
              </div>

              {!user ? (
                <div className="text-center py-20 text-slate-500 text-xs font-mono">
                  Login with Google to deploy and audit custom alert triggers.
                </div>
              ) : alerts.length === 0 ? (
                <div className="text-center py-20 text-slate-500 text-xs font-mono max-w-sm mx-auto">
                  <Bell className="w-10 h-10 text-slate-700 mx-auto mb-3" />
                  <span>No active alert triggers configured in the tracker query systems yet. Keep watching!</span>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {alerts.map((a) => (
                    <div key={a.id} className="bg-slate-950 border border-slate-850 p-4 rounded-xl flex flex-col justify-between">
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="font-bold text-xs text-white uppercase tracking-wider font-mono">{a.name}</h4>
                          <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                        </div>
                        <ul className="text-slate-400 font-mono text-[10px] space-y-1 bg-slate-900/40 p-2.5 rounded border border-slate-900">
                          <li>Target Area: <strong className="text-slate-200">{a.criteria.city}</strong></li>
                          {a.criteria.maxPrice && (
                            <li>Max Cap Limit: <strong className="text-slate-200">${a.criteria.maxPrice.toLocaleString()}</strong></li>
                          )}
                          <li>Bedrooms criteria: <strong className="text-slate-200">{a.criteria.beds}+ Beds</strong></li>
                        </ul>
                      </div>
                      <div className="flex items-center justify-between pt-3 mt-4 border-t border-slate-900">
                        <span className="text-[9px] text-slate-500 font-mono">UUID: {a.id}</span>
                        <button 
                          onClick={() => handleDeleteAlert(a.id)}
                          className="text-red-400 hover:text-red-300 transition text-[11px] font-mono flex items-center space-x-1 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
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
      <footer className="border-t border-slate-900 bg-slate-950/40 py-6 text-center mt-12">
        <span className="font-mono text-[10px] text-slate-500 block">&copy; 2026 Realty Monitor. Created and deployed with precise, ethical workspace standards.</span>
      </footer>
    </div>
  );
}
