
import { AppSettings, HistoryItem } from '../types';

const SETTINGS_KEY = 'dhaka_traffic_settings';
const HISTORY_KEY = 'dhaka_traffic_history';

const DEFAULT_SETTINGS: AppSettings = {
  voiceName: 'Kore',
  voiceStyle: 'Local',
  autoPlayAudio: true,
};

export const getSettings = (): AppSettings => {
  try {
    const saved = localStorage.getItem(SETTINGS_KEY);
    return saved ? { ...DEFAULT_SETTINGS, ...JSON.parse(saved) } : DEFAULT_SETTINGS;
  } catch (e) {
    return DEFAULT_SETTINGS;
  }
};

export const saveSettings = (settings: AppSettings) => {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
};

export const getHistory = (): HistoryItem[] => {
  try {
    const saved = localStorage.getItem(HISTORY_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch (e) {
    return [];
  }
};

export const addHistoryItem = (item: HistoryItem) => {
  const history = getHistory();
  // Keep last 10 items
  const newHistory = [item, ...history].slice(0, 10);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(newHistory));
};

export const clearHistory = () => {
  localStorage.removeItem(HISTORY_KEY);
};
