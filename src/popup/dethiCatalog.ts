// Content registry only; no storage, lookup, or UI dependencies.
import dethiCacNamRaw from "../data/dethi-n3-cac-nam.json";
import dethiN1CacNamRaw from "../data/dethi-n1-cac-nam.json";
import deN3SetRaw from "../data/de-n3-set-01.json";
import deN3Set02Raw from "../data/de-n3-set-02.json";
import deN3Set03Raw from "../data/de-n3-set-03.json";
import deN3Set04Raw from "../data/de-n3-set-04.json";
import deN3Set05Raw from "../data/de-n3-set-05.json";
import deN3Set06Raw from "../data/de-n3-set-06.json";
import deN3Set07Raw from "../data/de-n3-set-07.json";
import deN3Set08Raw from "../data/de-n3-set-08.json";
import deN3Set09Raw from "../data/de-n3-set-09.json";
import deN3Set10Raw from "../data/de-n3-set-10.json";
import type { DeThiDataset, DeThiExam } from "../types/dethi.ts";

export const JLPT_DATASETS: DeThiDataset[] = [
  dethiCacNamRaw as unknown as DeThiDataset,
  dethiN1CacNamRaw as unknown as DeThiDataset,
  deN3SetRaw as unknown as DeThiDataset,
  deN3Set02Raw as unknown as DeThiDataset,
  deN3Set03Raw as unknown as DeThiDataset,
  deN3Set04Raw as unknown as DeThiDataset,
  deN3Set05Raw as unknown as DeThiDataset,
  deN3Set06Raw as unknown as DeThiDataset,
  deN3Set07Raw as unknown as DeThiDataset,
  deN3Set08Raw as unknown as DeThiDataset,
  deN3Set09Raw as unknown as DeThiDataset,
  deN3Set10Raw as unknown as DeThiDataset,
];

// Same ordering as before: N3, then N1, newest first within each level.
export const ALL_EXAMS: DeThiExam[] = JLPT_DATASETS.flatMap((dataset) =>
  dataset.exams.map((exam) => ({ ...exam, level: dataset.meta.level }))
    .sort((a, b) => b.id.localeCompare(a.id)),
);
