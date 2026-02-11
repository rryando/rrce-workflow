
import * as fs from 'fs';
import * as path from 'path';
import { getDefaultRRCEHome, ensureDir } from './paths';
import { writeJsonAtomic } from './fs-safe';

export interface UserPreferences {
  defaultGlobalPath?: string;
  useCustomGlobalPath?: boolean;  // True if user explicitly chose a custom path
}

function getPreferencesPath(): string {
  // Always store preferences in the standard home location to avoid circular dependency
  // If user changes global path, the pointer (this pref file) still stays in standard home.
  const home = process.env.HOME || '~';
  return path.join(home, '.rrce-workflow', 'preferences.json');
}

export function loadUserPreferences(): UserPreferences {
  const prefPath = getPreferencesPath();
  if (!fs.existsSync(prefPath)) {
    return {};
  }
  try {
    return JSON.parse(fs.readFileSync(prefPath, 'utf-8'));
  } catch {
    return {};
  }
}

export function saveUserPreferences(prefs: UserPreferences): void {
  const prefPath = getPreferencesPath();
  ensureDir(path.dirname(prefPath));
  
  const current = loadUserPreferences();
  const refined = { ...current, ...prefs };
  
  writeJsonAtomic(prefPath, refined);
}
