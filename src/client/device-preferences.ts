import { useSyncExternalStore } from "react";
import { subscription } from "./external-store";
import {
  defaultWorkspace,
  parseWorkspace,
  type WorkspacePreferences,
} from "./workspace";

export const DEVICE_KEY = "lv-device-v2";
export interface DevicePreferences {
  version: 2;
  workspace: WorkspacePreferences;
  light: boolean;
  reduced: boolean;
  scale: number;
  markerSize: number;
  labels: boolean;
  routes: boolean;
  pois: boolean;
  players: boolean;
  friends: boolean;
  follow: boolean;
  zoomSensitivity: number;
  reconnectSummary: boolean;
}
export const defaultDevice: DevicePreferences = {
  version: 2,
  workspace: structuredClone(defaultWorkspace),
  light: false,
  reduced: false,
  scale: 100,
  markerSize: 100,
  labels: true,
  routes: true,
  pois: false,
  players: false,
  friends: true,
  follow: false,
  zoomSensitivity: 100,
  reconnectSummary: true,
};
export function parseDevice(
  raw: string | null,
  legacyWorkspace: string | null = null,
): DevicePreferences {
  let value: Partial<DevicePreferences> = {};
  try {
    const v: unknown = JSON.parse(raw ?? "{}");
    if (v && typeof v === "object" && !Array.isArray(v)) value = v;
  } catch {
    /* Legacy or corrupt local preferences receive bounded defaults. */
  }
  const next = structuredClone(defaultDevice);
  next.workspace = parseWorkspace(
    value.workspace ? JSON.stringify(value.workspace) : legacyWorkspace,
  );
  for (const key of [
    "light",
    "reduced",
    "labels",
    "routes",
    "friends",
    "follow",
    "reconnectSummary",
  ] as const)
    if (typeof value[key] === "boolean") next[key] = value[key];
  for (const key of ["scale", "markerSize", "zoomSensitivity"] as const) {
    const allowed =
      key === "scale"
        ? [90, 100, 110, 120]
        : key === "markerSize"
          ? [80, 100, 120, 140]
          : [50, 75, 100, 125, 150];
    if (allowed.includes(value[key] ?? -1)) next[key] = value[key]!;
  }
  return next;
}
let current: DevicePreferences | undefined,
  saved: DevicePreferences | undefined;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((fn) => fn());
export function devicePreferences(): DevicePreferences {
  if (!current) {
    try {
      current = parseDevice(
        localStorage.getItem(DEVICE_KEY),
        localStorage.getItem("lv-workspace-v1"),
      );
    } catch {
      current = structuredClone(defaultDevice);
    }
    saved = current;
  }
  return current;
}
export function savedDevicePreferences() {
  devicePreferences();
  return structuredClone(saved!);
}
export function previewDevicePreferences(value: DevicePreferences) {
  current = structuredClone(value);
  notify();
}
export function discardDevicePreferences() {
  current = savedDevicePreferences();
  notify();
}
export function applyDevicePreferences(value: DevicePreferences) {
  if (shortcutConflicts(value.workspace).length)
    throw new Error(
      "Tastenkürzel sind mehrfach belegt. Bitte den Konflikt auflösen.",
    );
  const normalized = parseDevice(JSON.stringify(value));
  try {
    localStorage.setItem(DEVICE_KEY, JSON.stringify(normalized));
  } catch {
    throw new Error(
      "Geräteeinstellungen konnten nicht gespeichert werden. Speicherfreigabe des Browsers prüfen; die bisherigen Einstellungen bleiben erhalten.",
    );
  }
  current = saved = normalized;
  notify();
}
export function updateDevicePreference<K extends keyof DevicePreferences>(
  key: K,
  value: DevicePreferences[K],
) {
  if (devicePreferences()[key] === value) return;
  applyDevicePreferences({ ...devicePreferences(), [key]: value });
}
const subscribePreferences = subscription(listeners);
export function useDevicePreferences() {
  return useSyncExternalStore(subscribePreferences, devicePreferences);
}
export function shortcutConflicts(workspace: WorkspacePreferences) {
  const keys = Object.values(workspace.keys).filter(Boolean);
  return [...new Set(keys.filter((key, index) => keys.indexOf(key) !== index))];
}
