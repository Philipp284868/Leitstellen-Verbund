import type { DatabaseSync } from "node:sqlite";
export const CATALOG_SCHEMA: string;
export function normalizeFacilities(
  records: unknown[],
  options?: {
    snapshot?: string;
    previous?: unknown[];
    supplemental?: unknown[];
    reviews?: unknown[];
  },
): Record<string, unknown>[];
export function writeFacilityCatalog(
  output: string,
  rows: unknown[],
  options?: {
    dataset?: string;
    snapshot?: string;
    index?: DatabaseSync;
    previousPath?: string;
  },
): Record<string, unknown>;
