import { demoStore } from './demoDataStore';
import { cloneRow, fail, ok, type Result, type Row } from './demoClientCore';

// The `from(table)` side of the demo client: PostgREST-style filters, ordering,
// embeds and writes, run against demoDataStore.

// PostgREST-style embedded selects (`workspace_members.select('..., workspaces(...)')`)
// resolved manually — the mock doesn't do joins. Maps the embed name (the
// foreign table) to the local FK on the base row and the foreign PK it points
// at. Covers every embed the app currently issues: workspace_members →
// workspaces (via workspace_id) and → profiles (via user_id).
const EMBED_RELATIONS: Record<string, { table: string; localKey: string; foreignKey: string }> = {
  workspaces: { table: 'workspaces', localKey: 'workspace_id', foreignKey: 'id' },
  profiles: { table: 'profiles', localKey: 'user_id', foreignKey: 'id' },
};

const parseEmbedNames = (columns: string): string[] => {
  const names: string[] = [];
  const re = /([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(columns)) !== null) {
    const name = match[1];
    if (EMBED_RELATIONS[name] && !names.includes(name)) names.push(name);
  }
  return names;
};

const matchesValue = (cell: unknown, value: unknown): boolean => {
  if (Array.isArray(cell)) {
    return cell.includes(value);
  }
  return cell === value;
};

// One condition of a PostgREST `or=(...)` filter, as the app writes it in
// `.or(...)`: `assignee_id.eq.<id>`, `assignee_ids.cs.{<id>}`. Values arrive as
// URL text, so cells are compared with them as strings.
interface OrCondition {
  column: string;
  operator: 'eq' | 'neq' | 'is' | 'in' | 'cs';
  value: string | string[] | null | boolean;
}

// Splits on the commas between conditions, not those inside `{a,b}` or `(a,b)`.
const splitOrConditions = (expr: string): string[] => {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const char of expr) {
    if (char === '(' || char === '{') depth += 1;
    if (char === ')' || char === '}') depth -= 1;
    if (char === ',' && depth === 0) {
      parts.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  parts.push(current);
  return parts;
};

const parseListValue = (raw: string, open: string, close: string): string[] | null => {
  if (!raw.startsWith(open) || !raw.endsWith(close)) return null;
  const inner = raw.slice(1, -1);
  return inner === '' ? [] : inner.split(',');
};

/**
 * The subset of PostgREST's logic tree the app sends. Anything else — nested
 * and()/or(), not., other operators — gives null, and the query then fails as
 * PostgREST would rather than quietly matching every row.
 */
const parseOrExpression = (expr: string): OrCondition[] | null => {
  const conditions: OrCondition[] = [];
  for (const part of splitOrConditions(expr)) {
    const match = /^([A-Za-z_][A-Za-z0-9_]*)\.(eq|neq|is|in|cs)\.(.+)$/.exec(part.trim());
    if (!match) return null;
    const [, column, operatorText, raw] = match;
    const operator = operatorText as OrCondition['operator'];
    if (operator === 'in' || operator === 'cs') {
      const list = operator === 'in' ? parseListValue(raw, '(', ')') : parseListValue(raw, '{', '}');
      if (!list) return null;
      conditions.push({ column, operator, value: list });
    } else if (operator === 'is') {
      if (raw !== 'null' && raw !== 'true' && raw !== 'false') return null;
      conditions.push({ column, operator, value: raw === 'null' ? null : raw === 'true' });
    } else {
      conditions.push({ column, operator, value: raw });
    }
  }
  return conditions;
};

const cellEqualsText = (cell: unknown, text: string): boolean => {
  if (Array.isArray(cell)) return cell.some((item) => String(item) === text);
  return cell !== null && cell !== undefined && String(cell) === text;
};

const matchesOrCondition = (row: Row, condition: OrCondition): boolean => {
  const cell = row[condition.column];
  switch (condition.operator) {
    case 'eq': return cellEqualsText(cell, condition.value as string);
    case 'neq': return !cellEqualsText(cell, condition.value as string);
    case 'is': return condition.value === null ? cell === null || cell === undefined : cell === condition.value;
    case 'in': return (condition.value as string[]).some((text) => cellEqualsText(cell, text));
    case 'cs': {
      if (!Array.isArray(cell)) return false;
      const cellTexts = cell.map(String);
      return (condition.value as string[]).every((text) => cellTexts.includes(text));
    }
  }
};

interface FilterOp {
  type: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'is' | 'like' | 'ilike' | 'contains' | 'or';
  column?: string;
  value?: unknown;
  values?: unknown[];
  expr?: string;
  /** For `or`: the parsed conditions, or null when `expr` could not be parsed. */
  conditions?: OrCondition[] | null;
}

interface OrderSpec {
  column: string;
  ascending: boolean;
  nullsFirst?: boolean;
}

const compare = (a: unknown, b: unknown): number => {
  if (a === b) return 0;
  if (a === null || a === undefined) return 1;
  if (b === null || b === undefined) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b));
};

const applyFilters = (rows: Row[], filters: FilterOp[]): Row[] => {
  return rows.filter((row) => filters.every((f) => {
    if (f.type === 'or') return (f.conditions ?? []).some((condition) => matchesOrCondition(row, condition));
    const cell = row[f.column ?? ''];
    switch (f.type) {
      case 'eq': return matchesValue(cell, f.value);
      case 'neq': return !matchesValue(cell, f.value);
      case 'gt': return compare(cell, f.value) > 0;
      case 'gte': return compare(cell, f.value) >= 0;
      case 'lt': return compare(cell, f.value) < 0;
      case 'lte': return compare(cell, f.value) <= 0;
      case 'in': return Array.isArray(f.values) && f.values.includes(cell);
      case 'is': return cell === f.value;
      case 'like':
      case 'ilike': {
        const pattern = String(f.value ?? '').replace(/%/g, '.*').replace(/_/g, '.');
        const flags = f.type === 'ilike' ? 'i' : '';
        return new RegExp(`^${pattern}$`, flags).test(String(cell ?? ''));
      }
      case 'contains':
        if (Array.isArray(cell) && Array.isArray(f.value)) {
          return f.value.every((v) => cell.includes(v));
        }
        return false;
      default:
        return true;
    }
  }));
};

export class QueryBuilder<T = Row> {
  constructor(
    private readonly tableName: string,
    private readonly op: 'select' | 'insert' | 'update' | 'delete' | 'upsert',
    private readonly payload?: Row | Row[],
  ) {}

  private filters: FilterOp[] = [];
  private orderSpecs: OrderSpec[] = [];
  private limitVal: number | null = null;
  private rangeVal: { from: number; to: number } | null = null;
  private singleMode: 'one' | 'maybe' | null = null;
  private columnsVal = '*';
  private throwOnErrorFlag = false;

  select(columns?: string): this {
    if (columns) this.columnsVal = columns;
    return this;
  }
  eq(column: string, value: unknown): this { this.filters.push({ type: 'eq', column, value }); return this; }
  neq(column: string, value: unknown): this { this.filters.push({ type: 'neq', column, value }); return this; }
  gt(column: string, value: unknown): this { this.filters.push({ type: 'gt', column, value }); return this; }
  gte(column: string, value: unknown): this { this.filters.push({ type: 'gte', column, value }); return this; }
  lt(column: string, value: unknown): this { this.filters.push({ type: 'lt', column, value }); return this; }
  lte(column: string, value: unknown): this { this.filters.push({ type: 'lte', column, value }); return this; }
  in(column: string, values: unknown[]): this { this.filters.push({ type: 'in', column, values }); return this; }
  is(column: string, value: unknown): this { this.filters.push({ type: 'is', column, value }); return this; }
  like(column: string, value: string): this { this.filters.push({ type: 'like', column, value }); return this; }
  ilike(column: string, value: string): this { this.filters.push({ type: 'ilike', column, value }); return this; }
  contains(column: string, value: unknown): this { this.filters.push({ type: 'contains', column, value }); return this; }
  not(column: string, _op: string, value: unknown): this {
    // Frontend rarely uses .not() — treat as neq for known cases.
    this.filters.push({ type: 'neq', column, value });
    return this;
  }
  or(expr: string): this {
    this.filters.push({ type: 'or', expr, conditions: parseOrExpression(expr) });
    return this;
  }
  filter(column: string, op: string, value: unknown): this {
    const known = ['eq','neq','gt','gte','lt','lte','in','is','like','ilike','contains'] as const;
    if ((known as readonly string[]).includes(op)) {
      this.filters.push({ type: op as FilterOp['type'], column, value });
    }
    return this;
  }
  order(column: string, opts?: { ascending?: boolean; nullsFirst?: boolean }): this {
    this.orderSpecs.push({ column, ascending: opts?.ascending !== false, nullsFirst: opts?.nullsFirst });
    return this;
  }
  limit(n: number): this { this.limitVal = n; return this; }
  range(from: number, to: number): this { this.rangeVal = { from, to }; return this; }
  single(): this { this.singleMode = 'one'; return this; }
  maybeSingle(): this { this.singleMode = 'maybe'; return this; }
  throwOnError(): this { this.throwOnErrorFlag = true; return this; }
  csv(): this { return this; }

  // Awaiting the builder triggers execution.
  then<TFulfilled = Result<T>, TRejected = never>(
    onFulfilled?: (value: Result<T>) => TFulfilled | PromiseLike<TFulfilled>,
    onRejected?: (reason: unknown) => TRejected | PromiseLike<TRejected>,
  ): Promise<TFulfilled | TRejected> {
    return Promise.resolve(this.execute()).then(onFulfilled, onRejected);
  }

  private execute(): Result<T> {
    const unparsedOr = this.filters.find((f) => f.type === 'or' && !f.conditions);
    if (unparsedOr) {
      // PostgREST answers an unreadable logic tree with PGRST100; so does the demo.
      return fail(`Demo client cannot parse or filter "${unparsedOr.expr}"`, 'PGRST100') as Result<T>;
    }
    const tbl = demoStore.table(this.tableName);

    let result: Row[] = [];

    if (this.op === 'select') {
      result = applyFilters(tbl, this.filters).map(cloneRow);
      const embeds = parseEmbedNames(this.columnsVal);
      if (embeds.length > 0) {
        result = result.map((row) => {
          const next: Row = { ...row };
          for (const name of embeds) {
            const rel = EMBED_RELATIONS[name];
            const localVal = row[rel.localKey];
            const match = demoStore.table(rel.table).find((fr) => fr[rel.foreignKey] === localVal);
            next[name] = match ? cloneRow(match) : null;
          }
          return next;
        });
      }
    } else if (this.op === 'insert' || this.op === 'upsert') {
      const incoming = Array.isArray(this.payload) ? this.payload : this.payload ? [this.payload] : [];
      const inserted: Row[] = [];
      const nowIso = new Date().toISOString();
      incoming.forEach((row) => {
        const next: Row = { ...row };
        if (!('id' in next) || next.id == null) {
          next.id = (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
            ? crypto.randomUUID()
            : `demo-${Math.random().toString(36).slice(2)}`;
        }
        if (!('created_at' in next)) next.created_at = nowIso;
        if (this.tableName === 'tasks' || this.tableName === 'milestones') next.updated_at = nowIso;
        tbl.push(next);
        inserted.push(cloneRow(next));
      });
      demoStore.touch();
      result = inserted;
    } else if (this.op === 'update') {
      const matching = applyFilters(tbl, this.filters);
      const patch = (this.payload ?? {}) as Row;
      const nowIso = new Date().toISOString();
      matching.forEach((row) => {
        Object.assign(row, patch);
        if (this.tableName === 'tasks' || this.tableName === 'milestones') row.updated_at = nowIso;
      });
      demoStore.touch();
      result = matching.map(cloneRow);
    } else if (this.op === 'delete') {
      const matching = applyFilters(tbl, this.filters);
      const ids = new Set(matching.map((r) => r.id));
      const remaining = tbl.filter((r) => !ids.has(r.id));
      tbl.length = 0;
      tbl.push(...remaining);
      demoStore.touch();
      result = matching.map(cloneRow);
    }

    if (this.orderSpecs.length > 0) {
      result.sort((a, b) => {
        for (const spec of this.orderSpecs) {
          const cmp = compare(a[spec.column], b[spec.column]) * (spec.ascending ? 1 : -1);
          if (cmp !== 0) return cmp;
        }
        return 0;
      });
    }
    if (this.rangeVal) {
      result = result.slice(this.rangeVal.from, this.rangeVal.to + 1);
    }
    if (this.limitVal != null) {
      result = result.slice(0, this.limitVal);
    }

    if (this.singleMode === 'one') {
      if (result.length !== 1) {
        return fail(`Expected single row, got ${result.length}`, 'PGRST116') as Result<T>;
      }
      return ok(result[0]) as Result<T>;
    }
    if (this.singleMode === 'maybe') {
      return ok(result[0] ?? null) as Result<T>;
    }
    return ok(result as unknown as T);
  }
}
