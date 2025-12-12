import React, { useState } from 'react';
import { TrafficAnalysisResult, NewsVerification } from '../types';
import { verifyWithNews, speakAdvice } from '../services/gemini';

interface AnalysisDisplayProps {
  result: TrafficAnalysisResult;
  location: string;
  destination: string;
}

const AnalysisDisplay: React.FC<AnalysisDisplayProps> = ({ result, location, destination }) => {
  const [news, setNews] = useState<NewsVerification | null>(null);
  const [loadingNews, setLoadingNews] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [copied, setCopied] = useState(false);

  const getJamColor = (level: string) => {
    switch (level) {
      case 'High': return 'text-red-400 border-red-900 bg-red-950/30';
      case 'Medium': return 'text-amber-400 border-amber-900 bg-amber-950/30';
      case 'Low': return 'text-emerald-400 border-emerald-900 bg-emerald-950/30';
      default: return 'text-slate-400 border-slate-700 bg-slate-800';
    }
  };

  const handleVerifyNews = async () => {
    setLoadingNews(true);
    try {
      const newsResult = await verifyWithNews(location);
      setNews(newsResult);
    } catch (e) {
      console.error("News verification failed", e);
    } finally {
      setLoadingNews(false);
    }
  };

  const handleSpeak = async () => {
    if (speaking) return;
    setSpeaking(true);
    try {
      // Jhuma speaks Banglish
      await speakAdvice(result.summary);
    } catch (e) {
      console.error("TTS failed", e);
    } finally {
      setSpeaking(false);
    }
  };

  const handleCopy = () => {
    const textToCopy = `🚦 *Traffic Update - ${location}*\n\n${result.summary}\n\n⏱ Delay: ${result.estimated_delay_minutes}\n📍 Jam Level: ${result.jam_level}\n\n- Via Dhaka Traffic Detective`;
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Generate Google Maps Directions URL
  const getDirectionsUrl = () => {
    const originParam = location.includes("Current Location") ? "" : `&origin=${encodeURIComponent(location)}`;
    const destParam = destination ? `&destination=${encodeURIComponent(destination)}` : "";
    
    // If we have both, we can make a directions link
    if (destination) {
       // If "Current Location" is used, Maps handles origin automatically if we omit it or use "Current+Location"
       // But to be precise, if we parsed lat/long we could use them. 
       // For now, simple text query works well with Maps Universal Link.
       return `https://www.google.com/maps/dir/?api=1${originParam}${destParam}&travelmode=driving`;
    }
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`;
  };

  return (
    <div className="space-y-6 animate-fade-in-up">
      
      {/* JHUMA CARD - The Persona */}
      <div className="bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 p-6 rounded-2xl border border-white/10 shadow-2xl relative overflow-hidden group">
        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity duration-700">
           <svg xmlns="http://www.w3.org/2000/svg" className="h-40 w-40" viewBox="0 0 24 24" fill="currentColor">
             <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>
           </svg>
        </div>
        
        <div className="relative z-10">
          <div className="flex justify-between items-start mb-6">
             <div className="flex items-center gap-3">
                 <div className="h-10 w-10 rounded-full bg-pink-500 flex items-center justify-center font-bold text-white text-xl shadow-lg border-2 border-pink-300">J</div>
                 <div>
                    <h3 className="text-white font-bold text-lg leading-none">Jhuma</h3>
                    <p className="text-pink-300 text-xs">AI Traffic Analyst</p>
                 </div>
             </div>
             
             <div className="flex gap-2 bg-black/20 p-1 rounded-lg backdrop-blur-sm">
                <button 
                  onClick={handleCopy}
                  className="text-pink-200 hover:text-white transition-colors p-2 hover:bg-white/10 rounded-md"
                  title="Copy to Clipboard"
                >
                  {copied ? (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                       <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m2 4h2a2 2 0 012 2v10a2 2 0 01-2 2H6a2 2 0 01-2-2V9a2 2 0 012-2h2" />
                    </svg>
                  )}
                </button>
                <button 
                    onClick={handleSpeak}
                    disabled={speaking}
                    className="text-pink-200 hover:text-white transition-colors p-2 hover:bg-white/10 rounded-md"
                    title="Listen to Jhuma"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 ${speaking ? 'animate-pulse text-emerald-400' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                  </svg>
                </button>
             </div>
          </div>
          
          <div className="space-y-5">
            <div className="bg-black/20 p-4 rounded-xl backdrop-blur-sm border border-white/5">
               <p className="text-white text-lg font-medium leading-relaxed font-bangla">{result.summary}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* TRAFFIC STATS */}
        <div className={`rounded-2xl border p-6 ${getJamColor(result.jam_level)} backdrop-blur-sm`}>
           <div className="flex items-center gap-2 mb-6">
              <div className="p-2 bg-current rounded-lg bg-opacity-10">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <h3 className="text-lg font-bold uppercase tracking-wider">Analysis Report</h3>
           </div>
           
           <div className="space-y-5">
              <div className="grid grid-cols-2 gap-4">
                  <div className="bg-black/20 p-3 rounded-lg text-center">
                    <span className="text-xs uppercase opacity-70 block mb-1">Level</span>
                    <span className="font-bold text-xl">{result.jam_level}</span>
                  </div>
                  <div className="bg-black/20 p-3 rounded-lg text-center">
                    <span className="text-xs uppercase opacity-70 block mb-1">Delay</span>
                    <span className="font-bold text-xl text-amber-300">{result.estimated_delay_minutes}</span>
                  </div>
              </div>
              
              <div>
                 <span className="text-xs uppercase opacity-70 font-bold block mb-2">Key Factors</span>
                 <ul className="space-y-2">
                    {result.key_reasons.map((reason, idx) => (
                        <li key={idx} className="flex items-start gap-2 text-sm">
                            <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-current opacity-60"></span>
                            {reason}
                        </li>
                    ))}
                 </ul>
              </div>

              <div>
                 <span className="text-xs uppercase opacity-70 font-bold block mb-2">Impacted Zones</span>
                 <div className="flex flex-wrap gap-2">
                    {result.affected_roads.map((road, idx) => (
                        <span key={idx} className="bg-black/20 border border-white/10 px-2 py-1 rounded text-xs font-medium">{road}</span>
                    ))}
                 </div>
              </div>
              
              <div className="pt-2 border-t border-white/10">
                  <button 
                    onClick={handleVerifyNews}
                    disabled={loadingNews}
                    className="w-full text-xs font-bold uppercase py-3 border border-dashed border-current rounded-lg hover:bg-white/5 transition-colors flex justify-center items-center gap-2"
                  >
                    {loadingNews ? (
                        <span className="animate-spin h-3 w-3 border-2 border-current rounded-full border-t-transparent"></span>
                    ) : (
                        <>
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
                            </svg>
                            Verify with Live News
                        </>
                    )}
                  </button>
              </div>

              {news && (
                <div className="mt-2 p-3 bg-slate-900/50 rounded-lg text-sm animate-fade-in border border-slate-700">
                   <h4 className="font-bold mb-1 text-emerald-400 text-xs uppercase">Verification Result</h4>
                   <p className="mb-2 text-slate-300 text-sm leading-relaxed">{news.summary}</p>
                </div>
              )}
           </div>
        </div>

        {/* BEST ROUTES & MAPS */}
        <div className="bg-slate-800/80 backdrop-blur-md border border-slate-700 rounded-2xl p-6 shadow-lg flex flex-col">
           <div className="flex items-center gap-2 mb-6 text-sky-400">
              <div className="p-2 bg-sky-500/10 rounded-lg">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0121 18.382V7.618a1 1 0 01-.806-.984A1 1 0 0120.206 6.36L15 8.764m0 0L9 7" />
                </svg>
              </div>
              <h3 className="text-lg font-bold uppercase tracking-wider">Strategic Routes</h3>
           </div>

           <div className="space-y-4 flex-grow">
              {result.best_routes.map((route, idx) => (
                <div key={idx} className="bg-sky-950/20 border border-sky-500/20 rounded-xl p-4 hover:border-sky-500/40 transition-colors group">
                   <div className="flex items-start gap-3">
                     <span className="bg-sky-500 text-white text-xs font-bold h-5 w-5 flex items-center justify-center rounded-full mt-0.5 shadow-lg shadow-sky-500/20">{idx + 1}</span>
                     <p className="text-sky-100 font-medium text-sm leading-relaxed">{route}</p>
                   </div>
                </div>
              ))}
              
              <div className="mt-6 space-y-3">
                 <a 
                   href={getDirectionsUrl()}
                   target="_blank" 
                   rel="noreferrer"
                   className="w-full py-3 bg-sky-600 hover:bg-sky-500 text-white rounded-xl font-bold uppercase text-sm tracking-wide shadow-lg shadow-sky-600/30 flex items-center justify-center gap-2 transition-all transform hover:-translate-y-0.5"
                 >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                    </svg>
                    Open Live Navigation
                 </a>

                 {result.mapLinks && result.mapLinks.length > 0 && (
                    <div className="grid grid-cols-1 gap-2">
                        {result.mapLinks.slice(0, 2).map((link, idx) => (
                          <a 
                            key={idx} 
                            href={link.uri} 
                            target="_blank" 
                            rel="noreferrer"
                            className="flex items-center gap-2 p-2 px-3 bg-slate-700/50 hover:bg-slate-700 rounded-lg text-slate-300 hover:text-white transition-colors text-xs font-medium"
                          >
                             <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                             </svg>
                             <span className="truncate">{link.title}</span>
                          </a>
                        ))}
                    </div>
                 )}
              </div>
           </div>
        </div>
      </div>
    </div>
  );
};

export default AnalysisDisplay;