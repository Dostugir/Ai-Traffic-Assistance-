import React, { useState, useEffect, useRef } from 'react';
import { connectToJhumaLive } from '../services/gemini';
import { addHistoryItem } from '../services/settings';
import { TranscriptItem } from '../types';

interface LiveConnection {
  disconnect: () => Promise<void>;
  sendVideoFrame: (base64: string) => void;
  sendText: (text: string) => void;
  setMuted: (muted: boolean) => void;
}

const LiveTrafficTalk: React.FC = () => {
  // Connection State
  const [status, setStatus] = useState<'idle' | 'connecting' | 'connected' | 'error'>('idle');
  const [connection, setConnection] = useState<LiveConnection | null>(null);
  
  // UI State
  const [isExpanded, setIsExpanded] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  
  // Camera State
  const [isCameraOn, setIsCameraOn] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const videoIntervalRef = useRef<number | null>(null);

  // Data State
  const [transcript, setTranscript] = useState<TranscriptItem[]>([]);
  const [streamingUser, setStreamingUser] = useState('');
  const [streamingJhuma, setStreamingJhuma] = useState('');
  
  // Buffers
  const userBufferRef = useRef('');
  const jhumaBufferRef = useRef('');
  const transcriptRef = useRef<HTMLDivElement>(null);

  // Auto-scroll transcript
  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
    }
  }, [transcript, streamingUser, streamingJhuma, isExpanded]);

  // Clean up video on unmount or disconnect
  useEffect(() => {
      return () => {
          stopCamera();
      };
  }, []);

  const startCamera = async () => {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { 
                facingMode: 'environment', 
                aspectRatio: { ideal: 1 }
            } 
        });
        
        streamRef.current = stream;
        setIsExpanded(true); // Ensure transcript is visible
        setIsCameraOn(true);
        
        setTimeout(() => {
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                videoRef.current.play().catch(e => console.error("Video play error:", e));
            }
            
            if (connection) {
                if (videoIntervalRef.current) clearInterval(videoIntervalRef.current);
                
                videoIntervalRef.current = window.setInterval(() => {
                    if (videoRef.current && canvasRef.current) {
                        const ctx = canvasRef.current.getContext('2d');
                        if (ctx && videoRef.current.videoWidth) { 
                            canvasRef.current.width = videoRef.current.videoWidth;
                            canvasRef.current.height = videoRef.current.videoHeight;
                            ctx.drawImage(videoRef.current, 0, 0);
                            
                            const dataUrl = canvasRef.current.toDataURL('image/jpeg', 0.5);
                            const base64 = dataUrl.split(',')[1];
                            connection.sendVideoFrame(base64);
                        }
                    }
                }, 500); 
            }
        }, 100);
        
    } catch (e) {
        console.error("Failed to start live camera", e);
        alert("Could not access camera for live stream.");
    }
  };

  const stopCamera = () => {
      if (videoIntervalRef.current) {
          clearInterval(videoIntervalRef.current);
          videoIntervalRef.current = null;
      }
      if (streamRef.current) {
          streamRef.current.getTracks().forEach(t => t.stop());
          streamRef.current = null;
      }
      setIsCameraOn(false);
  };

  const toggleCamera = () => {
      if (isCameraOn) {
          stopCamera();
      } else {
          startCamera();
      }
  };

  const toggleMute = () => {
      if (connection) {
          const newState = !isMuted;
          connection.setMuted(newState);
          setIsMuted(newState);
      }
  };

  const saveToHistory = (currentTranscript: TranscriptItem[]) => {
      if (currentTranscript.length > 0) {
          addHistoryItem({
              id: Date.now().toString(),
              timestamp: new Date().toISOString(),
              type: 'chat',
              transcript: currentTranscript
          });
      }
  };

  const toggleSession = async () => {
    if (status === 'connected' || status === 'connecting') {
      saveToHistory(transcript);
      stopCamera(); 
      if (connection) {
        await connection.disconnect();
      }
      setStatus('idle');
      setConnection(null);
      setIsExpanded(false);
      setStreamingUser('');
      setStreamingJhuma('');
      setIsMuted(false);
    } else {
      setStatus('connecting');
      setIsExpanded(true); 
      setTranscript([]);
      userBufferRef.current = '';
      jhumaBufferRef.current = '';
      setStreamingUser('');
      setStreamingJhuma('');
      setIsMuted(false);
      
      try {
        const conn = await connectToJhumaLive(
          () => setStatus('connected'),
          () => {
            setStatus('idle');
            setStreamingUser('');
            setStreamingJhuma('');
            stopCamera();
            setConnection(null);
            setIsMuted(false);
          },
          (e) => {
            console.error(e);
            setStatus('error');
            setTimeout(() => setStatus('idle'), 3000);
            stopCamera();
            setConnection(null);
            setIsMuted(false);
          },
          (sender, text, isFinal) => {
             if (sender === 'user') {
                userBufferRef.current += text;
                setStreamingUser(userBufferRef.current);
                
                if (isFinal) {
                   const isNew = !transcript.some(t => t.sender === 'user' && t.text === userBufferRef.current && parseInt(t.id) > Date.now() - 2000);
                   
                   if (userBufferRef.current.trim() && isNew) {
                      setTranscript(prev => [...prev, { id: Date.now().toString(), sender: 'user', text: userBufferRef.current }]);
                   }
                   userBufferRef.current = '';
                   setStreamingUser('');
                }
             } else {
                jhumaBufferRef.current += text;
                setStreamingJhuma(jhumaBufferRef.current);
                
                 if (isFinal) {
                   if (jhumaBufferRef.current.trim()) {
                      setTranscript(prev => [...prev, { id: Date.now().toString(), sender: 'jhuma', text: jhumaBufferRef.current }]);
                   }
                   jhumaBufferRef.current = '';
                   setStreamingJhuma('');
                }
             }
          },
          (origin, destination) => {
             setTranscript(prev => [...prev, {
                id: Date.now().toString(),
                sender: 'system',
                mapData: { origin, destination }
             }]);
             setIsExpanded(true);
          }
        );
        setConnection(conn);
      } catch (e) {
        console.error("Failed to connect", e);
        setStatus('error');
        setTimeout(() => setStatus('idle'), 3000);
      }
    }
  };

  useEffect(() => {
    return () => {
      if (connection) connection.disconnect();
    };
  }, [connection]);

  const getMapUrl = (origin: string, destination: string) => {
    const originParam = origin.toLowerCase().includes('current') ? '' : `&origin=${encodeURIComponent(origin)}`;
    return `https://www.google.com/maps/dir/?api=1${originParam}&destination=${encodeURIComponent(destination)}&travelmode=driving`;
  };

  // Main UI Wrapper
  // Changed from fixed inset-0 to a floating card widget style
  if (isExpanded) {
    return (
      <div className="fixed bottom-4 right-4 z-50 w-[95vw] md:w-[400px] h-[600px] max-h-[85vh] bg-slate-900/95 backdrop-blur-xl flex flex-col animate-fade-in-up rounded-2xl border border-slate-700 shadow-2xl overflow-hidden">
        
        {/* Header */}
        <div className="flex justify-between items-center px-5 py-4 border-b border-slate-800/50 bg-slate-900/50">
            <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></div>
                <h3 className="text-emerald-400 font-bold text-sm tracking-wider uppercase">Live Jhuma</h3>
                {isCameraOn && (
                    <span className="text-[10px] bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded uppercase font-bold border border-red-500/30">
                        Video On
                    </span>
                )}
                {isMuted && (
                     <span className="text-[10px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded uppercase font-bold border border-amber-500/30">
                        Muted
                    </span>
                )}
            </div>
            <button 
              onClick={() => setIsExpanded(false)}
              className="p-1.5 text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-full transition-colors"
            >
               <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z" clipRule="evenodd" transform="rotate(180 10 10)" />
               </svg>
            </button>
        </div>

        {/* Video Overlay - Positioned inside the widget */}
        {isCameraOn && (
           <div className="absolute top-16 right-4 z-40 w-24 h-24 bg-black rounded-lg overflow-hidden border border-emerald-500/50 shadow-lg">
               <video ref={videoRef} className="w-full h-full object-cover" muted playsInline autoPlay></video>
               <canvas ref={canvasRef} className="hidden"></canvas>
           </div>
        )}

        {/* Transcript */}
        <div ref={transcriptRef} className="flex-grow overflow-y-auto px-4 py-4 space-y-4 scroll-smooth bg-gradient-to-b from-slate-900/50 to-slate-900/80">
            {transcript.length === 0 && !streamingUser && !streamingJhuma && !isCameraOn && (
               <div className="flex flex-col items-center justify-center h-full text-slate-500 opacity-60 text-center px-4">
                  <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center mb-3">
                     <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                       <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                     </svg>
                  </div>
                  <p className="text-sm font-medium">Jhuma is listening...</p>
                  <p className="text-xs mt-1">Speak clearly about traffic.</p>
               </div>
            )}
            
            {transcript.map((item) => (
               <div key={item.id} className={`flex ${item.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                   {item.mapData ? (
                       <div className="bg-slate-800 border border-emerald-500/30 p-3 rounded-xl shadow-lg w-full max-w-[85%]">
                          <div className="flex items-center gap-2 mb-2">
                             <div className="bg-emerald-500/20 p-1.5 rounded-lg">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0121 18.382V7.618a1 1 0 01-.806-.984A1 1 0 0120.206 6.36L15 8.764m0 0L9 7" />
                                </svg>
                             </div>
                             <div>
                                <h4 className="text-emerald-400 font-bold text-xs">Route Suggested</h4>
                             </div>
                          </div>
                          <a 
                            href={getMapUrl(item.mapData.origin, item.mapData.destination)} 
                            target="_blank" 
                            rel="noreferrer"
                            className="block w-full text-center bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-1.5 rounded-lg text-xs transition-colors"
                          >
                             Open Maps
                          </a>
                       </div>
                   ) : (
                       <div className={`max-w-[85%] p-2.5 rounded-2xl text-sm leading-relaxed shadow-sm ${
                           item.sender === 'user' 
                           ? 'bg-slate-700 text-white rounded-br-none' 
                           : 'bg-indigo-900/60 border border-indigo-500/20 text-pink-100 rounded-bl-none'
                       }`}>
                           {item.sender === 'jhuma' && <span className="block text-[10px] font-bold text-pink-400 mb-0.5">Jhuma</span>}
                           {item.text}
                       </div>
                   )}
               </div>
            ))}

            {streamingUser && (
              <div className="flex justify-end">
                  <div className="max-w-[85%] p-2.5 rounded-2xl text-sm leading-relaxed bg-slate-700/50 text-slate-200 border border-slate-600 border-dashed rounded-br-none">
                      <span className="italic opacity-80">{streamingUser}</span>
                      <span className="inline-block w-1.5 h-3 ml-1 bg-emerald-400 animate-pulse align-middle"></span>
                  </div>
              </div>
            )}
            
            {streamingJhuma && (
              <div className="flex justify-start">
                  <div className="max-w-[85%] p-2.5 rounded-2xl text-sm leading-relaxed bg-indigo-900/30 text-pink-100 border border-pink-500/20 border-dashed rounded-bl-none">
                      <span className="block text-[10px] font-bold text-pink-400 mb-0.5">Jhuma is talking...</span>
                      <span className="italic opacity-80">{streamingJhuma}</span>
                  </div>
              </div>
            )}
        </div>

        {/* Control Bar */}
        <div className="p-4 bg-slate-900/95 border-t border-slate-800 backdrop-blur-md flex justify-between items-center z-[60]">
             <div className="flex items-center gap-2">
                 <button
                    onClick={toggleMute}
                    className={`p-3 rounded-full transition-colors shadow-lg ${
                        isMuted ? 'bg-amber-500 text-black hover:bg-amber-400' : 'bg-slate-700 text-white hover:bg-slate-600'
                    }`}
                    title={isMuted ? "Unmute" : "Mute"}
                 >
                     {isMuted ? (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                           <path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM14.657 2.929a1 1 0 011.414 0A9.972 9.972 0 0119 10a9.972 9.972 0 01-2.929 7.071 1 1 0 01-1.414-1.414A7.971 7.971 0 0017 10c0-2.21-.894-4.208-2.343-5.657a1 1 0 010-1.414zm-2.829 2.828a1 1 0 011.415 0A5.983 5.983 0 0115 10a5.983 5.983 0 01-1.757 4.243 1 1 0 01-1.415-1.415A3.984 3.984 0 0013 10a3.983 3.983 0 00-1.172-2.828 1 1 0 010-1.415z" clipRule="evenodd" />
                        </svg>
                     ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                           <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                        </svg>
                     )}
                 </button>
                 <button
                    onClick={toggleCamera}
                    className={`p-3 rounded-full transition-colors shadow-lg ${
                        isCameraOn ? 'bg-red-500 text-white hover:bg-red-400' : 'bg-slate-700 text-white hover:bg-slate-600'
                    }`}
                    title="Toggle Camera"
                 >
                     <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                     </svg>
                 </button>
             </div>
             
             <button 
                onClick={toggleSession}
                className="px-6 py-3 rounded-xl bg-red-500 hover:bg-red-600 text-white font-bold uppercase text-xs tracking-wider shadow-lg shadow-red-500/20"
             >
                End Call
             </button>
        </div>

      </div>
    );
  }

  // Collapsed View (Bottom Bar) - kept mostly same but updated text slightly
  return (
    <div className="fixed bottom-0 left-0 w-full z-50 bg-slate-800/90 border-t border-slate-700/50 p-4 shadow-2xl backdrop-blur-xl transition-all duration-300">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div 
             className="flex items-center gap-4 cursor-pointer" 
             onClick={() => {
                if (status === 'connected') setIsExpanded(true);
             }}
          >
            <div className={`relative w-12 h-12 rounded-full flex items-center justify-center transition-all ${status === 'connected' ? 'bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.5)]' : 'bg-slate-700'}`}>
               {status === 'connected' && (
                 <div className="absolute inset-0 rounded-full border-2 border-emerald-400 animate-ping opacity-75"></div>
               )}
               <svg xmlns="http://www.w3.org/2000/svg" className={`h-6 w-6 ${status === 'connected' ? 'text-black' : 'text-white'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
               </svg>
            </div>
            <div>
              <h3 className="font-bold text-white text-lg">Talk with Jhuma</h3>
              <p className="text-xs text-slate-400 font-medium flex items-center gap-2">
                {status === 'idle' && "Click 'Start' for live assistance"}
                {status === 'connecting' && "Connecting to satellite..."}
                {status === 'connected' && (
                    <>
                      <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
                      Live. Tap to expand.
                    </>
                )}
                {status === 'error' && "Connection Failed."}
              </p>
            </div>
          </div>

          <div>
             <button 
                onClick={toggleSession}
                className={`px-6 py-2.5 rounded-xl font-bold uppercase text-xs tracking-wider transition-all transform hover:scale-105 active:scale-95 ${
                status === 'connected' || status === 'connecting'
                    ? 'bg-red-500/90 hover:bg-red-600 text-white shadow-lg shadow-red-500/20' 
                    : 'bg-emerald-500/90 hover:bg-emerald-400 text-slate-900 shadow-lg shadow-emerald-500/20'
                }`}
            >
                {status === 'connected' || status === 'connecting' ? 'End' : 'Start'}
             </button>
          </div>
        </div>
    </div>
  );
};

export default LiveTrafficTalk;