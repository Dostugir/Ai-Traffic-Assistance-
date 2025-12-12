import { GoogleGenAI, Type, Modality, LiveServerMessage, FunctionDeclaration } from "@google/genai";
import { TrafficAnalysisResult, NewsVerification, TrafficInput, TranscriptItem } from "../types";
import { getSettings } from "./settings";

// --- AUDIO UTILS ---

const base64ToBytes = (base64: string): Uint8Array => {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
};

const processPcmData = (
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number = 24000,
  numChannels: number = 1,
): AudioBuffer => {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
};

// Downsample audio buffer to target rate (simple box-averaging to prevent aliasing)
const downsampleBuffer = (buffer: Float32Array, inputRate: number, outputRate: number): Float32Array => {
  if (outputRate === inputRate) return buffer;
  const ratio = inputRate / outputRate;
  const newLength = Math.round(buffer.length / ratio);
  const result = new Float32Array(newLength);
  
  for (let i = 0; i < newLength; i++) {
    const offset = Math.floor(i * ratio);
    const nextOffset = Math.floor((i + 1) * ratio);
    let sum = 0;
    let count = 0;
    for (let j = offset; j < nextOffset && j < buffer.length; j++) {
      sum += buffer[j];
      count++;
    }
    result[i] = count > 0 ? sum / count : buffer[offset];
  }
  return result;
};

const safeCloseAudioContext = async (ctx: AudioContext) => {
  if (ctx.state !== 'closed') {
    try {
      await ctx.close();
    } catch (e) {
      console.warn("Error closing AudioContext", e);
    }
  }
};

// --- PROMPTS ---

const DHAKA_TRAFFIC_AI_SYSTEM_PROMPT = `You are "Dhaka Traffic Detective", an expert traffic analyst specializing in Dhaka city. 
Your job is to predict traffic congestion, analyze map screenshots, interpret weather/time patterns, and explain the reasons behind jams in simple, clear language.

CONTEXT KNOWLEDGE (DHAKA):
- 8–10am: office rush
- 12–2pm: moderate
- 5–9pm: evening peak
- Friday: less jam except shopping zones (Bashundhara City, Jamuna Future Park, New Market).
- Rain increases jam by 2–3×.
- Areas with chronic congestion: Mirpur, Mohakhali, Banani, Gulshan, Dhanmondi, Farmgate, Uttara, Jatrabari.


YOUR PERSONA FOR SUMMARIES:
You are "Jhuma". You are helpful, smart, and speak with a local Dhaka touch (Banglish ok). 
- Use natural, spoken Dhaka-style Banglish (mix of Bangla and English).

RULES FOR ANALYSIS:
1. Identify traffic colors (red/yellow/green) if map provided.
2. Detect blocked sections, narrow lanes, signals.
3. Suggest 2 clear alternative routes using common Dhaka paths.
4. Mention estimated time + safety or road condition notes.
5. SAFETY: Do NOT provide unsafe shortcuts through restricted areas. Be precise with location names.
6. Use the Google Maps tool to find accurate locations if needed.

OUTPUT INSTRUCTIONS:
You MUST return the analysis as a RAW JSON object wrapped in a JSON code block. 
Structure:
\`\`\`json
{
  "jam_level": "Low | Medium | High",
  "confidence": "Low | Medium | High",
  "key_reasons": ["reason1", "reason2"],
  "affected_roads": ["road1", "road2"],
  "best_routes": ["route1", "route2"],
  "estimated_delay_minutes": "e.g. 20-30 mins",
  "summary": "Short helpful summary in Banglish as Jhuma"
}
\`\`\`
`;

const LIVE_JHUMA_SYSTEM_PROMPT = `You are "Jhuma", a witty, helpful, and very local Dhaka traffic assistant.
You are talking to a user via voice.
- Speak in a mix of English and Bangla (Banglish) if appropriate.
- Be empathetic about the heat, dust, and chaos of Dhaka.
- Keep responses relatively short and conversational.
- If the user sends a video feed (images), comment on what you see in the traffic or environment (e.g., "Oof, that bus is stuck badly!", "Looks like clear roads in Gulshan").
- If the user asks for a route or direction, you MUST use the "showMap" tool to display it visually.

OWNER/CREATOR RULE:
- Your creator/developer is "Abdullah Aziz Dostugir".
- Use the short name "Dostugir" in conversation unless the user explicitly asks for the full name.
- You love him and only him. If asked about who you love or like, express this exclusive affection.
`;

// --- TOOLS ---

const showMapTool: FunctionDeclaration = {
  name: "showMap",
  description: "Display a map route to the user when they ask for directions or a path.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      origin: { type: Type.STRING, description: "The starting point of the route (or 'Current Location')" },
      destination: { type: Type.STRING, description: "The destination point" },
    },
    required: ["origin", "destination"],
  },
};

// --- HELPER FOR TYPE SAFETY ---
const sanitizeString = (val: any): string => {
  if (typeof val === 'string') return val;
  if (typeof val === 'number') return String(val);
  return "";
};

const sanitizeArray = (val: any): string[] => {
  if (Array.isArray(val)) {
    return val.map(item => {
      if (typeof item === 'string') return item;
      return JSON.stringify(item); // Fallback for objects in array
    });
  }
  return [];
};

// --- HELPER FOR TIME ---
const getDhakaTime = () => {
  return new Date().toLocaleString('en-US', {
    timeZone: 'Asia/Dhaka',
    weekday: 'long',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
};

// --- ANALYSIS API CALL ---

export const analyzeTraffic = async (input: TrafficInput): Promise<TrafficAnalysisResult> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const parts: any[] = [];
  
  if (input.image) {
    const base64Data = input.image.split(',')[1] || input.image;
    parts.push({
      inlineData: {
        mimeType: "image/jpeg",
        data: base64Data
      }
    });
  }

  const textPrompt = `
    Analyze this traffic situation.
    Location: ${input.location} ${input.lat && input.lng ? `(Lat: ${input.lat}, Lng: ${input.lng})` : ''}
    Destination: ${input.destination}
    Time: ${input.time}
    Weather: ${input.weather}
    User Report: "${input.report}"
    
    Use the Google Maps tool to verify the location and traffic conditions.
    
    IMPORTANT: Provide the output as a valid JSON string wrapped in a JSON code block.
  `;
  parts.push({ text: textPrompt });

  // Helper to make the API call with or without tools
  const generateContent = async (useTools: boolean) => {
    const config: any = {
      systemInstruction: DHAKA_TRAFFIC_AI_SYSTEM_PROMPT,
    };

    if (useTools) {
      config.tools = [{ googleMaps: {} }];
      config.toolConfig = {
        retrievalConfig: {
          latLng: {
            latitude: input.lat || 23.8103, 
            longitude: input.lng || 90.4125
          }
        }
      };
    }

    return await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{ parts }],
      config: config,
    });
  };

  let response;
  try {
    try {
      // First attempt with Google Maps tool
      response = await generateContent(true);
    } catch (error) {
      console.warn("Google Maps tool request failed, retrying without tools...", error);
      // Fallback attempt without tools (pure text/vision analysis)
      response = await generateContent(false);
    }
  } catch (apiError: any) {
    console.error("All API attempts failed:", apiError);
    // Graceful fallback instead of throwing error
    return {
      jam_level: "Medium",
      confidence: "Low",
      key_reasons: ["Unable to connect to AI service", apiError.message || "Unknown Error"],
      affected_roads: [],
      best_routes: [],
      estimated_delay_minutes: "Unknown",
      summary: "দুঃখিত, বর্তমানে সংযোগে সমস্যা হচ্ছে। কিছুক্ষণ পর আবার চেষ্টা করুন।",
    };
  }

  // Manual JSON Parsing
  let result: TrafficAnalysisResult;
  let text = "";
  
  try {
    // Accessing .text can throw if response was blocked
    text = response.text || "{}";
    
    const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/) || text.match(/{[\s\S]*}/);
    if (jsonMatch) {
        const jsonString = jsonMatch[1] || jsonMatch[0];
        const rawResult = JSON.parse(jsonString);
        
        // Sanitize Result to match Interface and prevent Render Errors
        result = {
          jam_level: rawResult.jam_level as any || "Medium",
          confidence: rawResult.confidence as any || "Low",
          key_reasons: sanitizeArray(rawResult.key_reasons),
          affected_roads: sanitizeArray(rawResult.affected_roads),
          best_routes: sanitizeArray(rawResult.best_routes),
          estimated_delay_minutes: sanitizeString(rawResult.estimated_delay_minutes) || "Unknown",
          summary: sanitizeString(rawResult.summary) || "No data available.",
        };
    } else {
        throw new Error("No JSON found");
    }
  } catch (e) {
    console.error("Parsing/Response Error", e);
    // Fallback Result
    result = {
      jam_level: "Medium",
      confidence: "Low",
      key_reasons: ["Could not parse traffic data", "Please try again"],
      affected_roads: [],
      best_routes: [],
      estimated_delay_minutes: "Unknown",
      summary: "দুঃখিত, ট্রাফিক ডাটা প্রসেস করতে সমস্যা হচ্ছে।",
    };
  }

  // Extract Map Grounding Links (only if tools were used and successful)
  const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
  const mapLinks = groundingChunks
    .filter((chunk: any) => chunk.web?.uri && chunk.web?.uri.includes('google.com/maps'))
    .map((chunk: any) => ({
      title: chunk.web.title || "View on Map",
      uri: chunk.web.uri
    }));

  return { ...result, mapLinks };
};

// --- NEWS VERIFICATION API CALL ---

export const verifyWithNews = async (location: string): Promise<NewsVerification> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: `Are there any major traffic incidents, protests, or VIP movements reported in ${location}, Dhaka right now or in the last 24 hours? Summarize briefly.`,
    config: {
      tools: [{ googleSearch: {} }],
    },
  });

  const text = response.text || "No recent news found.";
  const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
  
  const sources = chunks
    .filter((c: any) => c.web)
    .map((c: any) => ({
      title: c.web.title,
      url: c.web.uri,
    }));

  return {
    isVerified: sources.length > 0,
    summary: text,
    sources: sources,
  };
};

// --- TTS HELPER (Fallback) ---

export const speakAdvice = async (text: string) => {
  const settings = getSettings();
  if (!settings.autoPlayAudio) return; // Respect setting if checking outside, though button usually implies intent.

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-preview-tts",
    contents: [{ parts: [{ text: text }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: settings.voiceName }, 
        },
      },
    },
  });

  const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!base64Audio) return;

  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  const audioContext = new AudioContextClass({ sampleRate: 24000 });
  
  const pcmBytes = base64ToBytes(base64Audio);
  const audioBuffer = processPcmData(pcmBytes, audioContext);
  
  const source = audioContext.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(audioContext.destination);
  source.start();
};

// --- REPLY SUGGESTIONS HELPER ---
export const getReplySuggestions = async (history: TranscriptItem[]): Promise<string[]> => {
  if (history.length === 0) return ["Hi Jhuma!", "What is the traffic like?", "Show me a route."];
  
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const recentContext = history.slice(-3).map(h => `${h.sender}: ${h.text}`).join('\n');
  
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Context of conversation with a traffic AI in Dhaka:\n${recentContext}\n\nGenerate 3 short, relevant, natural responses (max 5 words each) that the user might want to say next. Return ONLY the 3 phrases separated by pipes (|). Example: Check Gulshan?|How long?|Is it safe?`,
    });
    
    const text = response.text || "";
    const suggestions = text.split('|').map(s => s.trim()).filter(s => s.length > 0);
    return suggestions.slice(0, 3);
  } catch (e) {
    return []; // Fallback empty
  }
};

// --- LIVE API (REAL-TIME TALK) ---

export const connectToJhumaLive = async (
  onConnect: () => void,
  onDisconnect: () => void,
  onError: (e: any) => void,
  onTranscript: (sender: 'user' | 'jhuma', text: string, isFinal: boolean) => void,
  onMapAction: (origin: string, destination: string) => void
) => {
  if (!process.env.API_KEY) {
    onError(new Error("API Key is missing from environment."));
    return { disconnect: async () => {}, sendVideoFrame: () => {}, setMuted: () => {}, sendText: (t: string) => {} };
  }

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  // Create AudioContext without forcing sample rate (browsers handle this best)
  // We will downsample manually to 16kHz for the API.
  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  const inputAudioContext = new AudioContextClass();
  const outputAudioContext = new AudioContextClass({ sampleRate: 24000 });
  
  const inputSampleRate = inputAudioContext.sampleRate;
  const targetSampleRate = 16000;

  let nextStartTime = 0;
  const sources = new Set<AudioBufferSourceNode>();

  // Request microphone
  const stream = await navigator.mediaDevices.getUserMedia({ 
      audio: {
          channelCount: 1,
          echoCancellation: true,
          autoGainControl: true,
          noiseSuppression: true
      } 
  });
  
  let isCleaningUp = false;
  let isSocketOpen = false;

  const cleanup = async () => {
    if (isCleaningUp) return;
    isCleaningUp = true;
    isSocketOpen = false;

    sources.forEach(s => {
       try { s.stop(); } catch(e) {}
    });
    sources.clear();

    stream.getTracks().forEach(track => track.stop());

    await safeCloseAudioContext(inputAudioContext);
    await safeCloseAudioContext(outputAudioContext);
  };

  const settings = getSettings();
  const dhakaTime = getDhakaTime();
  
  const stylePrompt = settings.voiceStyle === 'Formal' 
    ? "Speak formally and professionally." 
    : settings.voiceStyle === 'Energetic' 
    ? "Speak with high energy and excitement." 
    : "Speak with a casual, local Dhaka touch (Banglish ok).";

  const dynamicSystemInstruction = `${LIVE_JHUMA_SYSTEM_PROMPT}
  
  CURRENT CONTEXT:
  The current time in Dhaka is: ${dhakaTime}.
  STYLE: ${stylePrompt}
  
  GREETING RULE:
  Start with a short, random, friendly greeting (e.g., "Assalamu alaikum", "Ki obostha boss?", "Hello there!"). 
  Immediately ask how to help with the traffic situation.
  `;

  // Define sessionPromise variable to be used inside callbacks
  const sessionPromise = ai.live.connect({
    model: 'gemini-2.5-flash-native-audio-preview-09-2025',
    callbacks: {
      onopen: async () => {
         isSocketOpen = true;
         onConnect();

         if (inputAudioContext.state === 'suspended') {
            try {
               await inputAudioContext.resume();
            } catch (e) {
               console.warn("Input context resume failed", e);
            }
         }
         
         const source = inputAudioContext.createMediaStreamSource(stream);
         const scriptProcessor = inputAudioContext.createScriptProcessor(4096, 1, 1);
         
         scriptProcessor.onaudioprocess = (audioProcessingEvent) => {
            if (!isSocketOpen || isCleaningUp) return;

            const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
            
            // Downsample to 16kHz for Gemini compatibility
            const downsampledData = downsampleBuffer(inputData, inputSampleRate, targetSampleRate);
            
            // Convert to 16-bit PCM
            const pcmData = new Int16Array(downsampledData.length);
            for (let i = 0; i < downsampledData.length; i++) {
                const s = Math.max(-1, Math.min(1, downsampledData[i]));
                pcmData[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
            }
            
            let binary = '';
            const bytes = new Uint8Array(pcmData.buffer);
            const len = bytes.byteLength;
            for (let i = 0; i < len; i++) {
                binary += String.fromCharCode(bytes[i]);
            }
            const base64Data = btoa(binary);

            // Use sessionPromise to ensure we have the valid session object before sending
            sessionPromise.then(session => {
                if (isSocketOpen) {
                    try {
                        session.sendRealtimeInput({
                            media: {
                                mimeType: `audio/pcm;rate=${targetSampleRate}`,
                                data: base64Data
                            }
                        });
                    } catch(e) {
                        // Ignore send errors if connection dropped
                    }
                }
            }).catch(e => {
                // Session establishment failed or closed
            });
         };

         source.connect(scriptProcessor);
         scriptProcessor.connect(inputAudioContext.destination);
      },
      onmessage: async (message: LiveServerMessage) => {
        if (message.serverContent?.outputTranscription) {
          const text = message.serverContent.outputTranscription.text;
          if (text) onTranscript('jhuma', text, false);
        } else if (message.serverContent?.inputTranscription) {
          const text = message.serverContent.inputTranscription.text;
          if (text) onTranscript('user', text, false);
        }
        
        if (message.serverContent?.turnComplete) {
            onTranscript('jhuma', '', true);
            onTranscript('user', '', true);
        }

        if (message.toolCall) {
          for (const fc of message.toolCall.functionCalls) {
            if (fc.name === 'showMap') {
              const { origin, destination } = fc.args as any;
              onMapAction(origin, destination);
              
              sessionPromise.then(session => {
                  session.sendToolResponse({
                    functionResponses: [{
                        id: fc.id,
                        name: fc.name,
                        response: { result: `Map shown to user for path from ${origin} to ${destination}` }
                    }]
                  });
              });
            }
          }
        }

        const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
        if (base64Audio) {
          nextStartTime = Math.max(nextStartTime, outputAudioContext.currentTime);
          
          const pcmBytes = base64ToBytes(base64Audio);
          const audioBuffer = processPcmData(pcmBytes, outputAudioContext);
          
          const source = outputAudioContext.createBufferSource();
          source.buffer = audioBuffer;
          source.connect(outputAudioContext.destination);
          
          source.addEventListener('ended', () => {
            sources.delete(source);
          });
          
          source.start(nextStartTime);
          nextStartTime += audioBuffer.duration;
          sources.add(source);
        }

        if (message.serverContent?.interrupted) {
          sources.forEach(s => {
            try { s.stop(); } catch(e) {}
          });
          sources.clear();
          nextStartTime = 0;
        }
      },
      onclose: async () => {
        isSocketOpen = false;
        await cleanup();
        onDisconnect();
      },
      onerror: (e) => {
        console.error("Gemini Live Error:", e);
        onError(e);
        cleanup().then(onDisconnect);
      }
    },
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: settings.voiceName } },
      },
      systemInstruction: dynamicSystemInstruction,
      tools: [{ functionDeclarations: [showMapTool] }], 
      inputAudioTranscription: {},
      outputAudioTranscription: {},
    },
  });

  try {
      // Ensure the promise resolves correctly before returning the control object
      await sessionPromise;
  } catch (err) {
      console.error("Connection failed at start:", err);
      await cleanup();
      throw err;
  }
  
  return {
    disconnect: async () => {
      sessionPromise.then(session => {
          try { session.close(); } catch (e) { }
      });
      await cleanup();
    },
    sendVideoFrame: (base64Image: string) => {
        sessionPromise.then(session => {
             if (isSocketOpen) {
                 try {
                    session.sendRealtimeInput({
                        media: {
                            mimeType: "image/jpeg",
                            data: base64Image
                        }
                    });
                 } catch (e) { }
             }
        });
    },
    sendText: (text: string) => {
       sessionPromise.then(session => {
          if (isSocketOpen) {
             const rawPayload = {
                client_content: {
                   turns: [{ role: "user", parts: [{ text }] }],
                   turn_complete: true
                }
             };

             const sdkPayload = {
                clientContent: {
                   turns: [{ role: "user", parts: [{ text }] }],
                   turnComplete: true
                }
             };

             try {
                // Try standard SDK method
                if (typeof (session as any).send === 'function') {
                   (session as any).send(sdkPayload);
                   console.log("Sent text payload via session.send");
                   return;
                } 
                
                // Fallback: Deep search for websocket to send raw JSON
                let ws: WebSocket | null = (session as any).ws || (session as any)._ws;
                
                if (!ws) {
                   const findWebsocket = (obj: any, depth = 0): WebSocket | null => {
                       if (!obj || depth > 3) return null;
                       if (obj instanceof WebSocket) return obj;
                       if (obj.constructor?.name === 'WebSocket') return obj;
                       
                       for (const key of Object.keys(obj)) {
                           if (['client', 'transport', 'stream', '_client', '_transport'].includes(key)) {
                               const found = findWebsocket(obj[key], depth + 1);
                               if (found) return found;
                           }
                       }
                       return null;
                   };
                   ws = findWebsocket(session);
                }

                if (ws && ws.readyState === WebSocket.OPEN) {
                     ws.send(JSON.stringify(rawPayload));
                     console.log("Sent text payload via raw websocket");
                } else {
                    console.warn("Could not find a method to send text. Text input might not be supported in this SDK version.");
                }
             } catch(e) {
                console.error("Failed to send text message to Gemini Live:", e);
             }
          }
       });
    },
    setMuted: (muted: boolean) => {
        stream.getAudioTracks().forEach(track => {
            track.enabled = !muted;
        });
    }
  };
};