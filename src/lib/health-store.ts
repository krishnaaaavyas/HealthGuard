import { useEffect, useState, useCallback } from "react";
import type { HealthResult } from "./health.functions";
import type { Lang } from "./i18n";

const KEY_RESULT = "hg.result.v1";
const KEY_PROFILE = "hg.profile.v1";
const KEY_HISTORY = "hg.history.v1";
const KEY_LANG = "hg.lang.v1";

export type Profile = {
  age: number;
  gender: "male" | "female" | "other";
  heightCm: number;
  weightKg: number;
  smoking: "never" | "former" | "current";
  exercise: "none" | "light" | "moderate" | "active";
  familyHistory: string;
  symptoms: string;
  schemaVersion?: number;
  engineVersion?: string;
};

export type StoredResult = HealthResult & {
  bmi: number;
  schemaVersion?: number;
  engineVersion?: string;
};

export type HistoryEntry = {
  date: string;
  overallScore: number;
  bmi: number;
  weightKg: number;
  risks: { diabetes: number; heartDisease: number; hypertension: number };
  schemaVersion?: number;
  engineVersion?: string;
};

export function readProfileCompatibility(raw: any): Profile | null {
  if (!raw) return null;
  return {
    ...raw,
    schemaVersion: raw.schemaVersion ?? 1,
    engineVersion: raw.engineVersion ?? "legacy",
  };
}

export function readStoredResultCompatibility(raw: any): StoredResult | null {
  if (!raw) return null;
  const { mlRisk, modelConfidence, modelVersion, experimentalResult, supportingFactors, ...rest } =
    raw;
  return {
    ...rest,
    schemaVersion: raw.schemaVersion ?? 1,
    engineVersion: raw.engineVersion ?? "legacy",
  };
}

export function readHistoryEntryCompatibility(raw: any): HistoryEntry {
  return {
    ...raw,
    schemaVersion: raw.schemaVersion ?? 1,
    engineVersion: raw.engineVersion ?? "legacy",
  };
}

function read<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);

    if (key === KEY_PROFILE) {
      return readProfileCompatibility(parsed) as unknown as T;
    }
    if (key === KEY_RESULT) {
      return readStoredResultCompatibility(parsed) as unknown as T;
    }
    if (key === KEY_HISTORY && Array.isArray(parsed)) {
      return parsed.map(readHistoryEntryCompatibility) as unknown as T;
    }

    return parsed as T;
  } catch {
    return null;
  }
}

function write<T>(key: string, value: T | null) {
  if (typeof window === "undefined") return;
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, JSON.stringify(value));
    window.dispatchEvent(new CustomEvent("hg:store", { detail: { key } }));
  } catch (err) {
    console.warn("localStorage write failed:", err);
  }
}

function useStored<T>(key: string): [T | null, (value: T | null) => void] {
  const [val, setVal] = useState<T | null>(() => read<T>(key));
  useEffect(() => {
    const sync = (e: Event) => {
      const detail = (e as CustomEvent).detail as { key?: string } | undefined;
      if (!detail || detail.key === key || detail.key === "all") setVal(read<T>(key));
    };
    window.addEventListener("hg:store", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("hg:store", sync);
      window.removeEventListener("storage", sync);
    };
  }, [key]);
  const setter = useCallback(
    (v: T | null) => {
      write(key, v);
      setVal(v);
    },
    [key],
  );
  return [val, setter];
}

export function useHealthResult() {
  return useStored<StoredResult>(KEY_RESULT);
}
export function useProfile() {
  return useStored<Profile>(KEY_PROFILE);
}
export function useHistory(): [HistoryEntry[], (entries: HistoryEntry[]) => void] {
  const [list, setList] = useStored<HistoryEntry[]>(KEY_HISTORY);
  return [list ?? [], setList];
}
export function useLangPref(): [Lang, (l: Lang) => void] {
  const [val, setVal] = useStored<Lang>(KEY_LANG);
  return [val ?? "en", (l) => setVal(l)];
}

export function pushHistory(entry: HistoryEntry) {
  const cur = read<HistoryEntry[]>(KEY_HISTORY) ?? [];
  write(KEY_HISTORY, [...cur, entry]);
}

export function hydrateHealthStore(data: {
  profile?: Profile | null;
  result?: StoredResult | null;
  history?: HistoryEntry[] | null;
}) {
  if (typeof window === "undefined") return;
  try {
    if (data.profile !== undefined) {
      if (data.profile === null) window.localStorage.removeItem(KEY_PROFILE);
      else window.localStorage.setItem(KEY_PROFILE, JSON.stringify(data.profile));
    }
    if (data.result !== undefined) {
      if (data.result === null) window.localStorage.removeItem(KEY_RESULT);
      else window.localStorage.setItem(KEY_RESULT, JSON.stringify(data.result));
    }
    if (data.history !== undefined) {
      if (data.history === null) window.localStorage.removeItem(KEY_HISTORY);
      else window.localStorage.setItem(KEY_HISTORY, JSON.stringify(data.history));
    }
    window.dispatchEvent(new CustomEvent("hg:store", { detail: { key: "all" } }));
  } catch (err) {
    console.warn("hydrateHealthStore failed:", err);
  }
}
