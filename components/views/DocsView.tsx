import React from "react";
import { BookOpen, Zap, Shield, Bell } from "lucide-react";

export function DocsView() {
  return (
    <div className="flex h-full min-h-[calc(100vh-64px)] bg-stone-50 text-stone-900 dark:bg-stone-950 dark:text-stone-100">
      {/* Side TOC Panel */}
      <nav className="hidden-scrollbar sticky top-0 hidden h-[calc(100vh-64px)] w-64 shrink-0 overflow-y-auto border-r border-stone-200 bg-stone-100/50 p-6 md:block dark:border-stone-800 dark:bg-stone-900/50">
        <h3 className="mb-4 text-sm font-semibold tracking-wider text-stone-500 uppercase">
          Documentation
        </h3>
        <ul className="space-y-3 text-sm">
          <li>
            <a
              href="#intro"
              className="text-primary-500 hover:text-primary-600 block font-medium transition"
            >
              Introduction
            </a>
          </li>
          <li>
            <a
              href="#quickstart"
              className="block text-stone-600 transition hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100"
            >
              Quickstart
            </a>
          </li>

          <h3 className="mt-8 mb-4 text-sm font-semibold tracking-wider text-stone-500 uppercase">
            Features
          </h3>
          <li>
            <a
              href="#harvester"
              className="block text-stone-600 transition hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100"
            >
              Email Harvester
            </a>
          </li>
          <li>
            <a
              href="#alerts"
              className="block text-stone-600 transition hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100"
            >
              Smart Alerts
            </a>
          </li>
          <li>
            <a
              href="#workspace"
              className="block text-stone-600 transition hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100"
            >
              Workspace Sync
            </a>
          </li>
        </ul>
      </nav>

      {/* Main Content Body (Mintlify Style) */}
      <div className="max-w-4xl flex-1 overflow-y-auto px-8 py-12 lg:px-16">
        <div className="prose prose-stone dark:prose-invert prose-primary max-w-none">
          <div className="bg-primary-500/10 text-primary-500 mb-6 inline-flex items-center space-x-2 rounded-full px-3 py-1 text-xs font-semibold">
            <BookOpen className="h-3.5 w-3.5" />
            <span>Official Guide</span>
          </div>

          <h1 id="intro" className="mb-4 text-4xl font-extrabold tracking-tight">
            Realty Monitor Docs
          </h1>
          <p className="max-w-2xl text-lg leading-relaxed text-stone-600 dark:text-stone-400">
            Welcome to the Realty Monitor platform. Our engine connects directly to your Google
            Workspace to harvest and track real estate listing alerts automatically.
          </p>

          <hr className="my-10 border-stone-200 dark:border-stone-800" />

          <h2 id="quickstart" className="mb-6 flex items-center gap-2 text-2xl font-bold">
            <Zap className="text-primary-500 h-6 w-6" />
            Quickstart
          </h2>

          <div className="my-8 grid grid-cols-1 gap-6 sm:grid-cols-2">
            <div className="hover:border-primary-500/50 rounded-xl border border-stone-200 bg-white p-6 shadow-sm transition-all dark:border-stone-800 dark:bg-stone-900">
              <Shield className="mb-4 h-8 w-8 text-stone-400" />
              <h3 className="mb-2 text-lg font-semibold">1. Connect Workspace</h3>
              <p className="text-sm text-stone-500 dark:text-stone-400">
                Authorize secure OAuth to give the agent temporary read-only access to parsing
                alerts.
              </p>
            </div>
            <div className="hover:border-primary-500/50 rounded-xl border border-stone-200 bg-white p-6 shadow-sm transition-all dark:border-stone-800 dark:bg-stone-900">
              <Bell className="mb-4 h-8 w-8 text-stone-400" />
              <h3 className="mb-2 text-lg font-semibold">2. Setup Alerts</h3>
              <p className="text-sm text-stone-500 dark:text-stone-400">
                Navigate to the Alerts Wizard to pick your official sources and set criteria.
              </p>
            </div>
          </div>

          <h3 id="harvester" className="mt-10 mb-4 text-xl font-semibold">
            How the Harvester Works
          </h3>
          <p className="mb-6 leading-relaxed text-stone-600 dark:text-stone-400">
            Instead of scraping sites directly, which breaks often, you subscribe to email alerts
            directly from Redfin, Zillow, or your MLS. When incoming listings arrive in your Gmail,
            our system parses them using LLMs securely in the background, extracts the listing
            details, and backfills it into our Firestore database.
          </p>

          <div className="overflow-x-auto rounded-lg border border-stone-200 bg-stone-100 p-4 font-mono text-xs dark:border-stone-800 dark:bg-stone-900">
            <code>
              const query = 'subject:"Redfin" OR subject:"Zillow" OR "new listing"';
              <br />
              await triggerGmailHarvest(query);
            </code>
          </div>

          <br className="my-10" />
          <h3 id="workspace" className="mt-10 mb-4 text-xl font-semibold">
            Google Workspace Sync
          </h3>
          <p className="mb-6 leading-relaxed text-stone-600 dark:text-stone-400">
            Exporting a listing directly to Sheets creates a structured log. Scheduling a tour
            directly pushes a Google Calendar block synchronously. You retain all data ownership.
          </p>
        </div>
      </div>
    </div>
  );
}
