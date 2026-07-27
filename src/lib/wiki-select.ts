/**
 * What a wiki page travels as. Two shapes, because a wiki's text is most of its
 * weight: the contents list carries titles and where each page sits, and the
 * page itself carries what is written on it.
 */
export const WIKI_FIELDS = {
  id: true,
  projectId: true,
  title: true,
  content: true,
  order: true,
  parentId: true,
  updatedAt: true,
} as const;

export const WIKI_INDEX_FIELDS = {
  id: true,
  projectId: true,
  title: true,
  order: true,
  parentId: true,
  updatedAt: true,
} as const;
