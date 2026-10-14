export type SaveData = {
  version: number;
  day: number;
  coins: number;
  seeds: number;
  tomatoes: number;
  wood: number;
  stone: number;
  plantedTotal: number;
  tiles: Record<string, { tilled?: boolean; crop?: { stage: number; watered: boolean } }>;
  player: { x: number; y: number };
};
const KEY = 'sylvaren-save-v1';
export function loadSave(): SaveData | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SaveData;
    if (parsed.version !== 1 || typeof parsed.day !== 'number' || !parsed.tiles || !parsed.player) return null;
    return parsed;
  } catch { return null; }
}
export function saveSave(data: SaveData): void {
  try { localStorage.setItem(KEY, JSON.stringify(data)); }
  catch (error) { console.warn('Could not save Sylvaren locally', error); }
}
