// Shared building blocks of the demo Supabase stand-in.

export type Row = Record<string, unknown>;
export type Result<T = unknown> = { data: T | null; error: { message: string; code?: string } | null };

export const ok = <T>(data: T): Result<T> => ({ data, error: null });
export const fail = (message: string, code?: string): Result => ({ data: null, error: { message, code } });

export const cloneRow = <T extends Row>(row: T): T => JSON.parse(JSON.stringify(row));
