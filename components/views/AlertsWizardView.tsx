import React, { useState } from "react";
import { Mail, CheckCircle2, ArrowRight, BellRing, Sparkles, Building2, Home } from "lucide-react";

export function AlertsWizardView() {
  const [criteria, setCriteria] = useState({
    city: "Austin",
    state: "TX",
    maxPrice: "1000000",
    beds: "3",
    emails: true
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [guideText, setGuideText] = useState("");

  const handleGenerate = async () => {
    setIsGenerating(true);
    // Simulate generation or actual call
    try {
      const response = await fetch("/api/gemini", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: `Generate a short step-by-step text guide for the user to sign up for email alerts on Zillow and Redfin using these specific criteria: City: ${criteria.city}, Max Price: ${criteria.maxPrice}, Beds: ${criteria.beds}. Keep it extremely concise and actionable.`
        })
      });
      const data = await response.json();
      setGuideText(data.text);
    } catch (e) {
      setGuideText("Failed to generate instructions. Please check network.");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-6 py-12">
      <div className="mb-10 text-center">
        <div className="inline-flex items-center justify-center bg-primary-500/10 text-primary-500 p-4 rounded-full mb-6">
          <BellRing className="w-8 h-8" />
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight mb-4 text-stone-900 dark:text-white">Email Alerts Setup Wizard</h1>
        <p className="text-stone-500 max-w-xl mx-auto">
          Set your preferred criteria here. We'll generate a personalized cheat sheet to help you subscribe to official MLS, Zillow, and Redfin alerts so our Harvester can catch them.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Criteria Form */}
        <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl p-6 shadow-sm">
          <h2 className="text-lg font-semibold mb-6 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary-500" />
            Your Criteria
          </h2>
          
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-stone-500 uppercase tracking-widest mb-1.5">City</label>
              <input 
                value={criteria.city}
                onChange={(e) => setCriteria({...criteria, city: e.target.value})}
                className="w-full bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded-lg p-3 text-sm focus:border-primary-500 focus:ring-1 focus:ring-primary-500 outline-none transition" 
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-stone-500 uppercase tracking-widest mb-1.5">Max Price</label>
                <input 
                  type="number"
                  value={criteria.maxPrice}
                  onChange={(e) => setCriteria({...criteria, maxPrice: e.target.value})}
                  className="w-full bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded-lg p-3 text-sm focus:border-primary-500 outline-none transition" 
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-500 uppercase tracking-widest mb-1.5">Min Beds</label>
                <input 
                  type="number"
                  value={criteria.beds}
                  onChange={(e) => setCriteria({...criteria, beds: e.target.value})}
                  className="w-full bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded-lg p-3 text-sm focus:border-primary-500 outline-none transition" 
                />
              </div>
            </div>

            <button
              onClick={handleGenerate}
              disabled={isGenerating}
              className="w-full mt-6 bg-stone-900 dark:bg-stone-100 text-stone-100 dark:text-stone-900 font-bold py-3 px-4 rounded-xl shadow transition hover:opacity-90 flex items-center justify-center gap-2"
            >
              {isGenerating ? "Generating..." : "Generate AI Setup Guide"}
              {!isGenerating && <ArrowRight className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Results Panel */}
        <div className="bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl p-6 h-full shadow-sm flex flex-col">
          <h2 className="text-lg font-semibold mb-6">Setup Cheat Sheet</h2>
          
          <div className="flex-1 rounded-xl bg-white dark:bg-stone-950 border border-stone-200 dark:border-stone-800 p-5 overflow-y-auto">
            {guideText ? (
              <div className="prose prose-sm dark:prose-invert prose-stone">
                <div dangerouslySetInnerHTML={{ __html: guideText.replace(/\n/g, "<br/>") }} />
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-stone-400 text-center space-y-3">
                <Mail className="w-8 h-8 opacity-50" />
                <p className="text-sm">Click generate to build your step-by-step setup guide for external property platforms.</p>
              </div>
            )}
          </div>
          
          <div className="grid grid-cols-2 gap-3 mt-6">
            <a href="https://www.zillow.com" target="_blank" rel="noreferrer" className="block text-center border border-stone-200 dark:border-stone-800 rounded-lg p-3 hover:border-primary-500 transition group bg-white dark:bg-stone-950">
              <Building2 className="w-5 h-5 mx-auto mb-2 text-primary-500 group-hover:scale-110 transition" />
              <span className="text-xs font-semibold">Zillow</span>
            </a>
            <a href="https://www.redfin.com" target="_blank" rel="noreferrer" className="block text-center border border-stone-200 dark:border-stone-800 rounded-lg p-3 hover:border-primary-500 transition group bg-white dark:bg-stone-950">
              <Home className="w-5 h-5 mx-auto mb-2 text-primary-500 group-hover:scale-110 transition" />
              <span className="text-xs font-semibold">Redfin</span>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
