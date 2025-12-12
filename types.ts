
export interface TrafficInput {
  location: string;
  destination: string;
  time: string;
  weather: string;
  report: string;
  image?: string; // Base64 string of the map screenshot
  lat?: number;
  lng?: number;
}

export interface TrafficAnalysisResult {
  jam_level: "Low" | "Medium" | "High";
  confidence: "Low" | "Medium" | "High";
  key_reasons: string[];
  affected_roads: string[];
  best_routes: string[];
  estimated_delay_minutes: string;
  summary: string;
  mapLinks?: { title: string; uri: string }[]; // New field for Maps Grounding
}

export interface NewsVerification {
  isVerified: boolean;
  summary: string;
  sources: { title: string; url: string }[];
}

export interface AppSettings {
  voiceName: 'Puck' | 'Charon' | 'Kore' | 'Fenrir' | 'Zephyr';
  voiceStyle: 'Local' | 'Formal' | 'Energetic';
  autoPlayAudio: boolean;
}

export interface TranscriptItem {
  id: string;
  sender: 'user' | 'jhuma' | 'system';
  text?: string;
  mapData?: { origin: string; destination: string };
}

export interface HistoryItem {
  id: string;
  timestamp: string;
  type?: 'analysis' | 'chat';
  location?: string;
  destination?: string;
  result?: TrafficAnalysisResult;
  transcript?: TranscriptItem[];
}