import React from "react";
import { BookOpen, Map, Settings, Zap, ArrowRight, Shield, Bell } from "lucide-react";

export function DocsView() {
  return (
    <div className="flex h-full min-h-[calc(100vh-64px)] bg-stone-50 dark:bg-stone-950 text-stone-900 dark:text-stone-100">
      {/* Side TOC Panel */}
      <nav className="w-64 border-r border-stone-200 dark:border-stone-800 bg-stone-100/50 dark:bg-stone-900/50 shrink-0 hidden md:block overflow-y-auto hidden-scrollbar p-6 sticky top-0 h-[calc(100vh-64px)]">
        <h3 className="font-semibold text-sm mb-4 text-stone-500 uppercase tracking-wider">Documentation</h3>
        <ul className="space-y-3 text-sm">
          <li><a href="#intro" className="block text-primary-500 font-medium transition hover:text-primary-600">Introduction</a></li>
          <li><a href="#quickstart" className="block text-stone-600 dark:text-stone-400 transition hover:text-stone-900 dark:hover:text-stone-100">Quickstart</a></li>
          
          <h3 className="font-semibold text-sm mt-8 mb-4 text-stone-500 uppercase tracking-wider">Features</h3>
          <li><a href="#harvester" className="block text-stone-600 dark:text-stone-400 transition hover:text-stone-900 dark:hover:text-stone-100">Email Harvester</a></li>
          <li><a href="#alerts" className="block text-stone-600 dark:text-stone-400 transition hover:text-stone-900 dark:hover:text-stone-100">Smart Alerts</a></li>
          <li><a href="#workspace" className="block text-stone-600 dark:text-stone-400 transition hover:text-stone-900 dark:hover:text-stone-100">Workspace Sync</a></li>
        </ul>
      </nav>

      {/* Main Content Body (Mintlify Style) */}
      <div className="flex-1 max-w-4xl px-8 py-12 lg:px-16 overflow-y-auto">
        <div className="prose prose-stone dark:prose-invert prose-primary max-w-none">
          <div className="inline-flex items-center space-x-2 bg-primary-500/10 text-primary-500 px-3 py-1 rounded-full text-xs font-semibold mb-6">
            <BookOpen className="w-3.5 h-3.5" />
            <span>Official Guide</span>
          </div>
          
          <h1 id="intro" className="text-4xl font-extrabold tracking-tight mb-4">Realty Monitor Docs</h1>
          <p className="text-lg text-stone-600 dark:text-stone-400 leading-relaxed max-w-2xl">
            Welcome to the Realty Monitor platform. Our engine connects directly to your Google Workspace to harvest and track real estate listing alerts automatically.
          </p>

          <hr className="my-10 border-stone-200 dark:border-stone-800" />

          <h2 id="quickstart" className="text-2xl font-bold mb-6 flex items-center gap-2">
            <Zap className="w-6 h-6 text-primary-500" />
            Quickstart
          </h2>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 my-8">
            <div className="border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 rounded-xl p-6 transition-all hover:border-primary-500/50 shadow-sm">
              <Shield className="w-8 h-8 text-stone-400 mb-4" />
              <h3 className="font-semibold text-lg mb-2">1. Connect Workspace</h3>
              <p className="text-sm text-stone-500 dark:text-stone-400">Authorize secure OAuth to give the agent temporary read-only access to parsing alerts.</p>
            </div>
            <div className="border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 rounded-xl p-6 transition-all hover:border-primary-500/50 shadow-sm">
              <Bell className="w-8 h-8 text-stone-400 mb-4" />
              <h3 className="font-semibold text-lg mb-2">2. Setup Alerts</h3>
              <p className="text-sm text-stone-500 dark:text-stone-400">Navigate to the Alerts Wizard to pick your official sources and set criteria.</p>
            </div>
          </div>

          <h3 id="harvester" className="text-xl font-semibold mt-10 mb-4">How the Harvester Works</h3>
          <p className="text-stone-600 dark:text-stone-400 leading-relaxed mb-6">
            Instead of scraping sites directly, which breaks often, you subscribe to email alerts directly from Redfin, Zillow, or your MLS. 
            When incoming listings arrive in your Gmail, our system parses them using LLMs securely in the background, extracts the listing details, and backfills it into our Firestore database.
          </p>
          
          <div className="bg-stone-100 dark:bg-stone-900 rounded-lg p-4 font-mono text-xs overflow-x-auto border border-stone-200 dark:border-stone-800">
            <code>
              const query = 'subject:"Redfin" OR subject:"Zillow" OR "new listing"';<br />
              await triggerGmailHarvest(query);
            </code>
          </div>

          <br className="my-10" />
          <h3 id="workspace" className="text-xl font-semibold mt-10 mb-4">Google Workspace Sync</h3>
          <p className="text-stone-600 dark:text-stone-400 leading-relaxed mb-6">
            Exporting a listing directly to Sheets creates a structured log. Scheduling a tour directly pushes a Google Calendar block synchronously. You retain all data ownership.
          </p>

        </div>
      </div>
    </div>
  );
}
