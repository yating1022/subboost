type ParamGetter = {
  get(name: string): string | null;
};

type IntegerParser = "integer-prefix" | "number";

export type ParseClampedIntOptions = {
  fallback: number;
  min: number;
  max: number;
  parser?: IntegerParser;
};

export type PagePaginationOptions = {
  pageParam?: string;
  sizeParam?: string;
  defaultPage?: number;
  defaultSize: number;
  maxPage?: number;
  maxSize: number;
  parser?: IntegerParser;
};

export type OffsetPaginationOptions = {
  takeParam?: string;
  skipParam?: string;
  defaultTake: number;
  maxTake: number;
  maxSkip: number;
  parser?: IntegerParser;
};

export function parseClampedIntParam(
  value: string | number | null | undefined,
  options: ParseClampedIntOptions
): number {
  const raw = value === null || value === undefined ? "" : String(value).trim();
  const parsed = options.parser === "number" ? Number(raw) : Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return options.fallback;

  const integer = options.parser === "number" ? Math.trunc(parsed) : Math.floor(parsed);
  return Math.min(options.max, Math.max(options.min, integer));
}

export function parsePagePagination(
  searchParams: ParamGetter,
  options: PagePaginationOptions
): { page: number; pageSize: number; skip: number } {
  const page = parseClampedIntParam(searchParams.get(options.pageParam ?? "page"), {
    fallback: options.defaultPage ?? 1,
    min: 1,
    max: options.maxPage ?? 1_000_000,
    parser: options.parser,
  });
  const pageSize = parseClampedIntParam(searchParams.get(options.sizeParam ?? "pageSize"), {
    fallback: options.defaultSize,
    min: 1,
    max: options.maxSize,
    parser: options.parser,
  });

  return {
    page,
    pageSize,
    skip: (page - 1) * pageSize,
  };
}

export function parseOffsetPagination(
  searchParams: ParamGetter,
  options: OffsetPaginationOptions
): { take: number; skip: number } {
  return {
    take: parseClampedIntParam(searchParams.get(options.takeParam ?? "take"), {
      fallback: options.defaultTake,
      min: 1,
      max: options.maxTake,
      parser: options.parser,
    }),
    skip: parseClampedIntParam(searchParams.get(options.skipParam ?? "skip"), {
      fallback: 0,
      min: 0,
      max: options.maxSkip,
      parser: options.parser,
    }),
  };
}

export function getTotalPages(total: number, pageSize: number, options: { minimum?: number } = {}): number {
  const minimum = options.minimum ?? 0;
  if (total <= 0 || pageSize <= 0) return minimum;
  return Math.max(minimum, Math.ceil(total / pageSize));
}
