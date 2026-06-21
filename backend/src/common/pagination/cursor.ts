/**
 * Minimal cursor-based pagination helper for time-ordered lists.
 * Cursor is the opaque `id` of the last item from the previous page.
 * Returns `{ data, nextCursor, hasMore }`. Use with `orderBy createdAt desc`
 * and a stable secondary order by `id` for determinism.
 */
export interface CursorPage<T> {
  data: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface CursorArgs {
  cursor?: string;
  limit?: number;
}

export const MAX_PAGE = 100;
export const DEFAULT_PAGE = 50;

export function parseCursorArgs(cursor?: string, take?: string): CursorArgs {
  const limit = Math.min(take ? parseInt(take, 10) || DEFAULT_PAGE : DEFAULT_PAGE, MAX_PAGE);
  return { cursor, limit };
}

/**
 * Builds the Prisma `take/cursor/skip` fragment. We fetch `limit + 1` to know
 * whether another page exists.
 */
export function prismaCursor(args: CursorArgs): {
  take: number;
  skip: number;
  cursor: { id: string } | undefined;
} {
  const take = (args.limit ?? DEFAULT_PAGE) + 1;
  return {
    take,
    skip: args.cursor ? 1 : 0,
    cursor: args.cursor ? { id: args.cursor } : undefined,
  };
}

export function buildPage<T extends { id: string }>(rows: T[], limit: number): CursorPage<T> {
  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  return {
    data,
    nextCursor: hasMore ? data[data.length - 1].id : null,
    hasMore,
  };
}
