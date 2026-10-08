// Content registry only; no storage, lookup, or UI dependencies.
import dethiCacNamRaw from "../data/dethi-n3-cac-nam.json";
import dethiN1CacNamRaw from "../data/dethi-n1-cac-nam.json";
import deN3SetRaw from "../data/de-n3-set-01.json";
import type { DeThiDataset, DeThiExam } from "../types/dethi.ts";

export const JLPT_DATASETS: DeThiDataset[] = [
  dethiCacNamRaw as unknown as DeThiDataset,
  dethiN1CacNamRaw as unknown as DeThiDataset,
  deN3SetRaw as unknown as DeThiDataset,
];

// Same ordering as before: N3, then N1, newest first within each level.
export const ALL_EXAMS: DeThiExam[] = JLPT_DATASETS.flatMap((dataset) =>
  dataset.exams.map((exam) => ({ ...exam, level: dataset.meta.level }))
    .sort((a, b) => b.id.localeCompare(a.id)),
);
