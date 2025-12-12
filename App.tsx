import React, { useState } from 'react';
import InputForm from './components/InputForm';
import AnalysisDisplay from './components/AnalysisDisplay';
import LiveTrafficTalk from './components/LiveTrafficTalk';
import SettingsMenu from './components/SettingsMenu';
import { analyzeTraffic } from './services/gemini';
import { addHistoryItem } from './services/settings';
import { TrafficAnalysisResult, TrafficInput } from './types';

const App: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TrafficAnalysisResult | null>(null);
  const [inputLocation, setInputLocation] = useState<string>("");
  const [inputDestination, setInputDestination] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const getErrorMessage = (err: any): string => {
    if (!err) return "Unknown error occurred";
    if (typeof err === 'string') return err;
    
    // Check if it's an Error instance or has a message property
    if (err instanceof Error || (typeof err === 'object' && err?.message)) {
       return err.message;
    }

    // Try to stringify if it's an object with keys (and not an empty Error object)
    try {
      const json = JSON.stringify(err);
      if (json && json !== '{}') return json;
    } catch (e) {
      // ignore serialization error
    }
    
    // Fallback: Use String() but avoid [object Object] if possible
    const str = String(err);
    if (str === '[object Object]') {
        return "An unexpected error occurred. Check console for details.";
    }
    return str;
  };

  const handleAnalysis = async (input: TrafficInput) => {
    setLoading(true);
    setError(null);
    setResult(null);
    setInputLocation(input.location);
    setInputDestination(input.destination);

    try {
      const analysisResult = await analyzeTraffic(input);
      setResult(analysisResult);
      
      // Save to History
      addHistoryItem({
        id: Date.now().toString(),
        type: 'analysis',
        timestamp: new Date().toISOString(),
        location: input.location,
        destination: input.destination,
        result: analysisResult
      });

    } catch (err: any) {
      console.error("Analysis Failed:", err);
      const msg = getErrorMessage(err);
      setError(`Dhaka Traffic Detective encountered an error: ${msg}. Please try again.`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 selection:bg-emerald-500 selection:text-white pb-32 relative font-inter overflow-x-hidden">
      {/* Background Ambience */}
      <div className="fixed inset-0 z-0 pointer-events-none">
          <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-emerald-900/10 blur-[100px]"></div>
          <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-indigo-900/10 blur-[100px]"></div>
      </div>

      <header className="bg-slate-950/80 backdrop-blur-md border-b border-slate-800 py-5 sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 flex items-center justify-between">
           <div className="flex items-center gap-3 group cursor-pointer" onClick={() => window.location.reload()}>
             <div className="bg-gradient-to-br from-emerald-500 to-emerald-700 p-2.5 rounded-xl text-white shadow-lg shadow-emerald-500/20 group-hover:scale-105 transition-transform">
               <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
               </svg>
             </div>
             <div>
               <h1 className="text-xl font-bold text-white tracking-tight">Dhaka Traffic Detective</h1>
               <div className="flex items-center gap-1.5">
                 <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                 <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">System Online</p>
               </div>
             </div>
           </div>

           <button 
             onClick={() => setIsSettingsOpen(true)}
             className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors"
           >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16m-7 6h7" />
              </svg>
           </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-10 relative z-10">
        <div className="mb-10">
          <div className="text-center mb-8 animate-fade-in">
             <h2 className="text-3xl md:text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 via-sky-400 to-indigo-400 mb-3">
               Navigate Dhaka's Chaos
             </h2>
             <p className="text-slate-400 text-lg max-w-xl mx-auto">
               Your AI-powered detective for real-time traffic intelligence and smart routing.
             </p>
          </div>
          
          <InputForm onSubmit={handleAnalysis} isLoading={loading} />
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/50 text-red-400 p-5 rounded-xl text-center font-bold mb-8 animate-pulse shadow-lg shadow-red-500/10">
             {error}
          </div>
        )}

        {result && (
          <AnalysisDisplay 
            result={result}
            location={inputLocation}
            destination={inputDestination}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="text-center text-slate-600 text-sm py-8 relative z-10 border-t border-slate-900 bg-slate-950">
        &copy; {new Date().getFullYear()} Dhaka Traffic Detective. Powered by Gemini 2.5 Flash. Developed by Md Abdullah Aziz Dostugir.
      </footer>

      {/* Overlays */}
      <LiveTrafficTalk />
      <SettingsMenu isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
    </div>
  );
};

export default App;