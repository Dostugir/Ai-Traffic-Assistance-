import React, { useState, useEffect, useRef } from 'react';
import { getSettings, saveSettings, getHistory, clearHistory } from '../services/settings';
import { AppSettings, HistoryItem } from '../types';

interface SettingsMenuProps {
  isOpen: boolean;
  onClose: () => void;
}

const SettingsMenu: React.FC<SettingsMenuProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<'settings' | 'history' | 'voice'>('settings');
  const [settings, setSettings] = useState<AppSettings>(getSettings());
  const [history, setHistory] = useState<HistoryItem[]>([]);
  
  // Voice Model State
  const [isRecording, setIsRecording] = useState(false);
  const [analysisStatus, setAnalysisStatus] = useState<'idle' | 'analyzing' | 'success'>('idle');
  const [detectedPitch, setDetectedPitch] = useState(0);
  const [recordingDuration, setRecordingDuration] = useState(0);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  useEffect(() => {
    if (isOpen) {
      setSettings(getSettings());
      setHistory(getHistory());
      setAnalysisStatus('idle');
    }
  }, [isOpen]);

  const handleSaveSettings = (newSettings: AppSettings) => {
    setSettings(newSettings);
    saveSettings(newSettings);
  };

  // --- VOICE MATCH LOGIC ---
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      // Setup Analysis
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioContextClass();
      audioContextRef.current = audioCtx;
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 2048;
      analyserRef.current = analyser;
      
      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingDuration(0);

      // Start Visualizer / Pitch approximation
      const updateAnalysis = () => {
        if (!analyserRef.current) return;
        const bufferLength = analyserRef.current.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        analyserRef.current.getByteFrequencyData(dataArray);

        // Simple weighted average to approximate "pitch" or activity
        let sum = 0;
        let weightedSum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
          weightedSum += dataArray[i] * i;
        }
        const avg = sum > 0 ? weightedSum / sum : 0;
        setDetectedPitch(avg); // Not real Hz, but a relative index

        setRecordingDuration(prev => prev + 0.016); // ~60fps
        animationFrameRef.current = requestAnimationFrame(updateAnalysis);
      };
      updateAnalysis();

    } catch (e) {
      console.error("Mic error", e);
      alert("Microphone access needed for Voice Match.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(t => t.stop());
    }
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    if (audioContextRef.current) audioContextRef.current.close();
    
    setIsRecording(false);
    setAnalysisStatus('analyzing');

    // Simulate AI Analysis Delay
    setTimeout(() => {
        // Logic: Map the "detectedPitch" average to a voice
        // Lower index ~ Lower pitch (Fenrir/Zephyr), Higher index ~ Higher pitch (Kore/Puck)
        // This is pseudo-science for the UI effect, but functional for user choice.
        let match: 'Fenrir' | 'Zephyr' | 'Kore' | 'Puck' = 'Kore';
        
        if (detectedPitch < 50) match = 'Fenrir'; // Deep
        else if (detectedPitch < 100) match = 'Zephyr'; // Medium-Low
        else if (detectedPitch < 150) match = 'Puck'; // Medium-High
        else match = 'Kore'; // High

        handleSaveSettings({ ...settings, voiceName: match });
        setAnalysisStatus('success');
    }, 2000);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={onClose}></div>
      <div className="bg-slate-900 border border-slate-700 w-full max-w-lg h-[600px] rounded-2xl shadow-2xl overflow-hidden flex flex-col relative animate-fade-in-up">
        
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-900 z-10">
           <h2 className="text-xl font-bold text-white flex items-center gap-2">
             <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
             </svg>
             System Control
           </h2>
           <button onClick={onClose} className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-full">
             <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
             </svg>
           </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-800 bg-slate-900/50">
           {(['settings', 'history', 'voice'] as const).map(tab => (
             <button
               key={tab}
               onClick={() => setActiveTab(tab)}
               className={`flex-1 py-3 text-sm font-bold uppercase tracking-wider transition-all ${
                 activeTab === tab 
                 ? 'text-emerald-400 border-b-2 border-emerald-400 bg-slate-800/50' 
                 : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/30'
               }`}
             >
               {tab === 'voice' ? 'Voice Model' : tab}
             </button>
           ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-900">
           
           {/* SETTINGS TAB */}
           {activeTab === 'settings' && (
             <div className="space-y-6">
                <div className="space-y-4">
                  <h3 className="text-slate-400 text-xs font-bold uppercase tracking-wider">Audio Preferences</h3>
                  
                  <div className="flex items-center justify-between p-4 bg-slate-800 rounded-xl border border-slate-700">
                     <span className="text-white font-medium">Auto-Play Analysis</span>
                     <button 
                       onClick={() => handleSaveSettings({...settings, autoPlayAudio: !settings.autoPlayAudio})}
                       className={`w-12 h-6 rounded-full p-1 transition-colors ${settings.autoPlayAudio ? 'bg-emerald-500' : 'bg-slate-600'}`}
                     >
                        <div className={`w-4 h-4 rounded-full bg-white shadow-md transform transition-transform ${settings.autoPlayAudio ? 'translate-x-6' : 'translate-x-0'}`}></div>
                     </button>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-slate-400 text-xs font-bold uppercase tracking-wider">Persona Style</h3>
                  <div className="grid grid-cols-1 gap-3">
                     {['Local', 'Formal', 'Energetic'].map((style) => (
                        <button
                          key={style}
                          onClick={() => handleSaveSettings({...settings, voiceStyle: style as any})}
                          className={`p-3 rounded-xl border text-left transition-all ${
                             settings.voiceStyle === style 
                             ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400' 
                             : 'border-slate-700 bg-slate-800 text-slate-400 hover:border-slate-600'
                          }`}
                        >
                           <div className="font-bold">{style}</div>
                           <div className="text-xs opacity-70">
                              {style === 'Local' ? "Friendly, uses Banglish slang." : 
                               style === 'Formal' ? "Professional, clear, precise." : 
                               "High energy, enthusiastic."}
                           </div>
                        </button>
                     ))}
                  </div>
                </div>
             </div>
           )}

           {/* HISTORY TAB */}
           {activeTab === 'history' && (
             <div className="space-y-4">
               {history.length === 0 ? (
                 <div className="text-center text-slate-500 py-10">
                    <p>No analysis history yet.</p>
                 </div>
               ) : (
                 history.map((item) => {
                   if (item.type === 'chat' && item.transcript) {
                      // Chat History Item
                      const msgCount = item.transcript.length;
                      const lastMsg = item.transcript[msgCount-1]?.text || "No details";
                      return (
                        <div key={item.id} className="p-4 bg-slate-800 rounded-xl border border-pink-500/30 shadow-[0_0_10px_rgba(236,72,153,0.05)]">
                           <div className="flex justify-between items-start mb-2">
                             <div className="flex items-center gap-2">
                                <span className="bg-pink-500/20 text-pink-400 p-1.5 rounded-lg">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                                    </svg>
                                </span>
                                <h4 className="font-bold text-pink-100 text-sm">Live Chat with Jhuma</h4>
                             </div>
                             <span className="text-xs text-slate-500">{new Date(item.timestamp).toLocaleDateString()}</span>
                           </div>
                           <p className="text-xs text-slate-400 line-clamp-2 italic">"{lastMsg}"</p>
                           <div className="mt-2 flex gap-2">
                             <span className="text-[10px] px-2 py-0.5 rounded border border-pink-900 bg-pink-900/20 text-pink-300">
                               {msgCount} messages
                             </span>
                           </div>
                        </div>
                      );
                   }
                   
                   // Analysis History Item (Default)
                   if (!item.result) return null;
                   
                   return (
                    <div key={item.id} className="p-4 bg-slate-800 rounded-xl border border-slate-700">
                        <div className="flex justify-between items-start mb-2">
                            <h4 className="font-bold text-white text-sm">{item.location}</h4>
                            <span className="text-xs text-slate-500">{new Date(item.timestamp).toLocaleDateString()}</span>
                        </div>
                        <p className="text-xs text-slate-400 line-clamp-2">{item.result.summary}</p>
                        <div className="mt-2 flex gap-2">
                            <span className={`text-[10px] px-2 py-0.5 rounded border ${
                                item.result.jam_level === 'High' ? 'text-red-400 border-red-900 bg-red-900/20' : 
                                item.result.jam_level === 'Medium' ? 'text-amber-400 border-amber-900 bg-amber-900/20' : 
                                'text-emerald-400 border-emerald-900 bg-emerald-900/20'
                            }`}>{item.result.jam_level} Traffic</span>
                        </div>
                    </div>
                   );
                 })
               )}
               {history.length > 0 && (
                 <button onClick={() => { clearHistory(); setHistory([]); }} className="w-full py-2 text-xs text-red-400 hover:bg-red-950/30 rounded-lg">
                   Clear History
                 </button>
               )}
             </div>
           )}

           {/* VOICE MODEL TAB */}
           {activeTab === 'voice' && (
             <div className="space-y-6">
                <div className="p-4 bg-gradient-to-br from-indigo-900/50 to-purple-900/50 rounded-xl border border-indigo-500/30 text-center">
                   <h3 className="text-white font-bold mb-1">Create Your Voice Model</h3>
                   <p className="text-xs text-indigo-200 mb-4">Record your voice to generate a matching AI persona frequency.</p>
                   
                   {!isRecording && analysisStatus !== 'analyzing' && (
                      <button 
                        onClick={startRecording}
                        className="h-16 w-16 rounded-full bg-red-500 hover:bg-red-400 text-white shadow-[0_0_20px_rgba(239,68,68,0.5)] flex items-center justify-center transition-transform hover:scale-105 mx-auto"
                      >
                         <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                           <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                         </svg>
                      </button>
                   )}

                   {isRecording && (
                      <div className="space-y-4">
                        <div className="h-16 flex items-center justify-center gap-1">
                           {[...Array(8)].map((_, i) => (
                             <div 
                               key={i} 
                               className="w-2 bg-red-500 rounded-full transition-all duration-75"
                               style={{ height: `${Math.max(10, Math.random() * detectedPitch * 0.5)}%` }}
                             ></div>
                           ))}
                        </div>
                        <p className="text-xs text-red-300 animate-pulse">Recording Analysis... {recordingDuration.toFixed(1)}s</p>
                        <button onClick={stopRecording} className="px-4 py-1 bg-slate-800 text-white rounded text-xs border border-white/10">Stop & Analyze</button>
                      </div>
                   )}

                   {analysisStatus === 'analyzing' && (
                      <div className="py-4 flex flex-col items-center">
                         <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-2"></div>
                         <p className="text-xs text-indigo-300">Generating Voice Profile...</p>
                      </div>
                   )}

                   {analysisStatus === 'success' && (
                      <div className="py-2 animate-fade-in-up">
                         <div className="text-emerald-400 font-bold mb-1">✓ Voice Model Created</div>
                         <p className="text-xs text-slate-300">Matched Frequency: <span className="text-white font-mono">{settings.voiceName}</span></p>
                      </div>
                   )}
                </div>

                <div className="space-y-3">
                   <h3 className="text-slate-400 text-xs font-bold uppercase tracking-wider">Current Voice Setting</h3>
                   <div className="grid grid-cols-2 gap-3">
                      {['Puck', 'Kore', 'Fenrir', 'Zephyr'].map(voice => (
                         <button
                           key={voice}
                           onClick={() => handleSaveSettings({...settings, voiceName: voice as any})}
                           className={`p-3 rounded-lg border text-sm font-medium transition-all ${
                             settings.voiceName === voice
                             ? 'border-indigo-500 bg-indigo-500/20 text-white shadow-[0_0_10px_rgba(99,102,241,0.2)]'
                             : 'border-slate-700 bg-slate-800 text-slate-400 hover:bg-slate-700'
                           }`}
                         >
                            {voice}
                            {voice === settings.voiceName && <span className="ml-2 text-indigo-400">●</span>}
                         </button>
                      ))}
                   </div>
                </div>
             </div>
           )}

        </div>
      </div>
    </div>
  );
};

export default SettingsMenu;