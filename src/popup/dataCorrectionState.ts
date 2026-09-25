import { storageGet, storageSet } from "../platform/storage";

const STORAGE_KEY = "dataCorrectionNotes";
const EXPORT_VERSION = 1;

export type CorrectionIssueType =
  | "add-new-vocab"
  | "wrong-meaning"
  | "additional-meaning"
  | "wrong-reading"
  | "wrong-usage"
  | "wrong-example"
  | "personal-note"
  | "other";

export type CorrectionStatus = "open" | "applied";

export interface VocabCorrectionSnapshot {
  word: string;
  reading: string | null;
  level?: string;
  meaningVi: string;
  sources: string[];
}

export interface GrammarCorrectionSnapshot {
  pattern: string;
  level: string;
  meaningVi: string;
  sources: string[];
  chapter?: number;
  chapterTitle?: string;
}

export type CorrectionSnapshot = VocabCorrectionSnapshot | GrammarCorrectionSnapshot;
export type CorrectionEntityType = "vocab" | "grammar";

interface DataCorrectionBase {
  id: string;
  entityType: CorrectionEntityType;
  entityId: string;
  snapshot: CorrectionSnapshot;
  issueType: CorrectionIssueType;
  suggestedValue: string;
  note: string;
  status: CorrectionStatus;
  createdAt: string;
  updatedAt: string;
}

export type DataCorrectionEntry =
  | (DataCorrectionBase & { entityType: "vocab"; snapshot: VocabCorrectionSnapshot })
  | (DataCorrectionBase & { entityType: "grammar"; snapshot: GrammarCorrectionSnapshot });

export interface SaveCorrectionInput {
  id?: string;
  entityType?: CorrectionEntityType;
  entityId: string;
  snapshot: CorrectionSnapshot;
  issueType: CorrectionIssueType;
  suggestedValue: string;
  note: string;
}

function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `correction-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export async function loadDataCorrections(): Promise<DataCorrectionEntry[]> {
  const stored = await storageGet<unknown>(STORAGE_KEY);
  if (!Array.isArray(stored)) return [];
  return stored.filter(
    (entry): entry is DataCorrectionEntry =>
      typeof entry === "object" &&
      entry !== null &&
      ((entry as DataCorrectionEntry).entityType === "vocab" || (entry as DataCorrectionEntry).entityType === "grammar") &&
      typeof (entry as DataCorrectionEntry).id === "string" &&
      typeof (entry as DataCorrectionEntry).entityId === "string" &&
      typeof (entry as DataCorrectionEntry).suggestedValue === "string",
  );
}

async function writeDataCorrections(entries: DataCorrectionEntry[]): Promise<void> {
  await storageSet(STORAGE_KEY, entries);
}

export async function saveDataCorrection(input: SaveCorrectionInput): Promise<DataCorrectionEntry> {
  const entries = await loadDataCorrections();
  const existing = input.id ? entries.find((entry) => entry.id === input.id) : undefined;
  const now = new Date().toISOString();
  const entityType = input.entityType ?? existing?.entityType ?? ("word" in input.snapshot ? "vocab" : "grammar");
  const base = {
    id: existing?.id ?? createId(),
    entityId: input.entityId,
    issueType: input.issueType,
    suggestedValue: input.suggestedValue.trim(),
    note: input.note.trim(),
    status: existing?.status ?? "open",
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  let next: DataCorrectionEntry;
  if (entityType === "vocab" && "word" in input.snapshot) {
    next = { ...base, entityType, snapshot: input.snapshot };
  } else if (entityType === "grammar" && "pattern" in input.snapshot) {
    next = { ...base, entityType, snapshot: input.snapshot };
  } else {
    throw new Error("Correction entity type does not match its snapshot");
  }
  const updated = existing ? entries.map((entry) => (entry.id === existing.id ? next : entry)) : [next, ...entries];
  await writeDataCorrections(updated);
  return next;
}

export async function deleteDataCorrection(id: string): Promise<void> {
  const entries = await loadDataCorrections();
  await writeDataCorrections(entries.filter((entry) => entry.id !== id));
}

export async function setDataCorrectionStatus(id: string, status: CorrectionStatus): Promise<void> {
  const entries = await loadDataCorrections();
  const updatedAt = new Date().toISOString();
  await writeDataCorrections(entries.map((entry) => (entry.id === id ? { ...entry, status, updatedAt } : entry)));
}

export async function loadCorrectionsForEntity(entityId: string): Promise<DataCorrectionEntry[]> {
  return (await loadDataCorrections()).filter((entry) => entry.entityId === entityId);
}

export async function exportDataCorrectionsJson(): Promise<string> {
  const corrections = await loadDataCorrections();
  return JSON.stringify(
    {
      version: EXPORT_VERSION,
      exportedAt: new Date().toISOString(),
      purpose: "Review these proposals before updating src/data. Do not apply automatically.",
      reviewRules: "docs/data-correction-review-rules.md",
      corrections,
    },
    null,
    2,
  );
}
