// What each API route accepts, checked before the route runs: the method, no
// body (no route reads one), and each query parameter, which must be one the
// route knows, given once, and valid. A request that fails is answered with a
// 4xx and a fixed message; the values it sent are never repeated back.
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { decodeCursor } from './cursor.js';
import type { SearchPosition } from './store.js';

export interface Param<T> {
  // The value, or undefined when the text is not a valid one
  parse(raw: string): T | undefined;
  // What a valid value is, for the error message
  describe: string;
  required?: boolean;
}

type Params = Record<string, Param<unknown>>;
export type Query<P extends Params> = { [K in keyof P]: P[K] extends Param<infer T> ? T | undefined : never };

const reject = (res: Response, status: number, error: string) => res.status(status).json({ success: false, error });

// A check for one route: the methods it answers (HEAD comes with GET) and its
// query parameters. The parsed values are in res.locals.query (see queryOf).
export function accepts<P extends Params>(methods: ('GET' | 'POST')[], params: P = {} as P): RequestHandler {
  const allowed = new Set<string>(methods.includes('GET') ? [...methods, 'HEAD'] : methods);
  const allow = [...allowed].join(', ');
  return (req: Request, res: Response, next: NextFunction) => {
    if (!allowed.has(req.method)) {
      res.set('Allow', allow);
      reject(res, 405, 'Method not allowed');
      return;
    }
    if (Number(req.get('content-length') ?? 0) > 0 || req.get('transfer-encoding')) {
      reject(res, 400, 'This request takes no body');
      return;
    }
    const query: Record<string, unknown> = {};
    for (const [name, value] of Object.entries(req.query)) {
      const param = Object.hasOwn(params, name) ? params[name] : undefined;
      if (!param) {
        reject(res, 400, 'Unexpected query parameter');
        return;
      }
      if (typeof value !== 'string') {
        reject(res, 400, `${name} may be given only once`);
        return;
      }
      const parsed = param.parse(value);
      if (parsed === undefined) {
        reject(res, 400, `${name} must be ${param.describe}`);
        return;
      }
      query[name] = parsed;
    }
    for (const [name, param] of Object.entries(params)) {
      if (param.required && !(name in query)) {
        reject(res, 400, `${name} is required: ${param.describe}`);
        return;
      }
    }
    res.locals.query = query;
    next();
  };
}

// The query parameters accepts() checked
export const queryOf = <P extends Params>(res: Response, _params: P) => res.locals.query as Query<P>;

// Text of min to max characters, without the spaces around it
export const text = (min: number, max: number, required = false): Param<string> => ({
  parse: raw => {
    const value = raw.trim();
    return value.length >= min && value.length <= max ? value : undefined;
  },
  describe: `${min} to ${max} characters`,
  required
});

// A calendar day that exists, as YYYY-MM-DD
export const day: Param<string> = {
  parse: raw => (/^\d{4}-\d{2}-\d{2}$/.test(raw) && !isNaN(Date.parse(`${raw}T00:00:00Z`)) &&
    new Date(`${raw}T00:00:00Z`).toISOString().slice(0, 10) === raw ? raw : undefined),
  describe: 'a calendar day as YYYY-MM-DD'
};

// 1 or 0
export const flag: Param<boolean> = {
  parse: raw => (raw === '1' ? true : raw === '0' ? false : undefined),
  describe: '1 or 0'
};

// A JSON array of 1 to max notice ids, each 1 to 240 characters
export const idList = (max: number, required = false): Param<string[]> => ({
  parse: raw => {
    let ids: unknown;
    try { ids = JSON.parse(raw); } catch { return undefined; }
    return Array.isArray(ids) && ids.length > 0 && ids.length <= max &&
      ids.every(id => typeof id === 'string' && id.length > 0 && id.length <= 240) ? ids as string[] : undefined;
  },
  describe: `a JSON array of 1 to ${max} notice ids`,
  required
});

// A whole number from min to max
export const integer = (min: number, max: number): Param<number> => ({
  parse: raw => (/^\d{1,6}$/.test(raw) && Number(raw) >= min && Number(raw) <= max ? Number(raw) : undefined),
  describe: `a whole number from ${min} to ${max}`
});

// A cursor from an earlier page's nextCursor (server/cursor.ts)
export const cursor: Param<SearchPosition> = {
  parse: decodeCursor,
  describe: 'the nextCursor of an earlier page'
};
