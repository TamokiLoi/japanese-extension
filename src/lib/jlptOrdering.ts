import type { DeThiQuestion } from "../types/dethi.ts";

export interface OrderingReconstruction {
  sentence: string;
  order: number[];
}

const ORDERING_SLOT_PATTERN = /(?:[（(][\t 　]*(?:★[\t 　]*)?[）)]|[\[［][\t 　]*(?:★[\t 　]*)?[\]］]|[＿_]{2,}|★)/gu;

/**
 * Rebuild a 問題2 / 問題6 sentence from its four answer fragments.
 * Source transcriptions use several placeholder styles; some compress the
 * four blanks into a single ★ or split it into more/fewer visual markers.
 */
export function reconstructOrderingQuestion(question: DeThiQuestion): OrderingReconstruction | null {
  const correctIndex = question.correctIndex;
  const order = question.orderingOrder;
  if (
    correctIndex === null ||
    correctIndex < 0 ||
    correctIndex >= 4 ||
    !order ||
    order.length !== 4 ||
    question.options.length !== 4 ||
    new Set(order).size !== 4 ||
    order.some((index) => !Number.isInteger(index) || index < 0 || index >= 4)
  ) {
    return null;
  }

  const slots = [...question.question.matchAll(ORDERING_SLOT_PATTERN)];
  const starredSlots = slots.filter((slot) => slot[0].includes("★"));
  if (starredSlots.length !== 1 || slots.length === 0) return null;

  const slotIndexByOption = new Map(order.map((optionIndex, index) => [optionIndex, index]));
  const starOrderIndex = slotIndexByOption.get(correctIndex);
  if (starOrderIndex === undefined) return null;

  const pieces = order.map((optionIndex, index) => `${index === starOrderIndex ? "★" : ""}${question.options[optionIndex]}`);

  // Four explicit blanks preserve the printed ★ position and also validate
  // that the answer key names the fragment in that slot.
  if (slots.length === 4) {
    const starSlot = slots.indexOf(starredSlots[0]);
    if (order[starSlot] !== correctIndex) return null;

    let sentence = "";
    let cursor = 0;
    for (const [index, slot] of slots.entries()) {
      const gap = question.question.slice(cursor, slot.index);
      sentence += index > 0 && /^[\t 　\r\n]*$/u.test(gap) ? "" : gap;
      sentence += `${index === starSlot ? "★" : ""}${question.options[order[index]]}`;
      cursor = slot.index + slot[0].length;
    }
    return { sentence: sentence + question.question.slice(cursor), order };
  }

  // For a single ★, or source layouts that compress/expand the blank region,
  // replace the contiguous placeholder cluster with the ordered four pieces.
  const first = slots[0];
  const last = slots.at(-1)!;
  const internalText = slots.slice(1).map((slot, index) =>
    question.question.slice(slots[index].index + slots[index][0].length, slot.index),
  );
  if (internalText.some((gap) => !/^[\t 　\r\n]*$/u.test(gap))) return null;

  const cluster = pieces.join("");
  return {
    sentence: question.question.slice(0, first.index) + cluster + question.question.slice(last.index + last[0].length),
    order,
  };
}
