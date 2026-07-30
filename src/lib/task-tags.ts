/** More than this on one task and the labels stop labelling anything. */
const MAX_TAGS_PER_TASK = 8;

/**
 * The tags a payload puts on a task, deduped and capped. Unlike the people on
 * a task, an over-long list is trimmed rather than refused: a tag is a label,
 * and losing the ninth one is not worth failing a save over.
 */
export function parseTagIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const ids: string[] = [];
  for (const raw of value) {
    if (typeof raw !== "string" || !raw || ids.includes(raw)) continue;
    ids.push(raw);
    if (ids.length === MAX_TAGS_PER_TASK) break;
  }
  return ids;
}
