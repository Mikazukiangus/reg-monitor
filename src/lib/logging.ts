// Shared, dependency-free log sanitization. The browser logger never receives
// server configuration; the server supplies its known secrets in logging.ts.
export const REDACTED = '[REDACTED]';

const sensitiveKey = (key: string) => /(?:passwords?|passwd|pwds?|secrets?|tokens?|apikeys?|authorization|cookies?|databaseurl|postgresurl|connectionstring|credentials?|privatekeys?|accesskeyid|signature|sig|sas|sessionids?|csrf|xsrf)$/.test(key.replace(/[^a-z\d]/gi, '').toLowerCase()) || /^(?:auth|key)$/i.test(key);

export function createRedactor(secrets: readonly string[] = []) {
  const variants = new Set<string>();
  for (const secret of secrets.filter(Boolean)) {
    variants.add(secret);
    variants.add(encodeURIComponent(secret));
    variants.add(JSON.stringify(secret).slice(1, -1));
  }
  const literals = [...variants].sort((a, b) => b.length - a.length);
  const text = (input: string): string => {
    let output = input;
    for (const secret of literals) output = output.split(secret).join(REDACTED);
    output = output
      .replace(/-----BEGIN [A-Z ]*PRIVATE KEY(?: BLOCK)?-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY(?: BLOCK)?-----|$)/g, REDACTED)
      .replace(/\b([a-z][a-z\d+.-]*:\/\/)[^\s/?#]+@/gi, (_match, scheme) => `${scheme}${REDACTED}@`)
      .replace(/([?&])([^=&#\s"'<>]+)=([^&#\s"'<>]*)/g, (match, separator, key) => {
        let decoded = key;
        try { decoded = decodeURIComponent(key); } catch { /* retain the key */ }
        return sensitiveKey(decoded) ? `${separator}${key}=${REDACTED}` : match;
      })
      .replace(/\b(Bearer|Basic)\s+[a-z\d+/_=.:~-]+/gi, (_match, scheme) => `${scheme} ${REDACTED}`)
      .replace(/\b(?:gh[pousr]_[a-z\d]{20,}|github_pat_[a-z\d_]{20,}|re_[a-z\d_]{20,}|sk-(?:proj-|svcacct-)?[a-z\d_-]{20,}|[rs]k_(?:live|test)_[a-z\d]{20,}|xox[baprs]-[a-z\d-]{10,}|AKIA[A-Z\d]{16})\b/gi, REDACTED)
      .replace(/\beyJ[a-z\d_-]+\.[a-z\d_-]+\.[a-z\d_-]{8,}\b/gi, REDACTED)
      .replace(/(\b([a-z][\w.-]*)["']?\s*[:=]\s*)(?:"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'|([^\s,;&#}<>"']+))/gi,
        (match, prefix, key, doubleQuoted, singleQuoted) => {
          if (!sensitiveKey(key)) return match;
          const quote = doubleQuoted !== undefined ? '"' : singleQuoted !== undefined ? "'" : '';
          return `${prefix}${quote}${REDACTED}${quote}`;
        });
    // Keep untrusted errors on one log line; terminal control sequences must
    // not forge another entry. Redact before truncation to avoid partial leaks.
    return output.replace(/[\u0000-\u001f\u007f-\u009f]/g, character => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`).slice(0, 8000);
  };
  const value = (input: unknown, seen = new WeakSet<object>(), depth = 0): unknown => {
    if (typeof input === 'string') return text(input);
    if (input === null || typeof input === 'number' || typeof input === 'boolean' || input === undefined) return input;
    if (typeof input === 'bigint') return input.toString();
    if (typeof input !== 'object') return '[Unsupported log value]';
    if (ArrayBuffer.isView(input) || input instanceof ArrayBuffer) return '[Binary data]';
    if (seen.has(input)) return '[Circular]';
    if (depth >= 6) return '[Maximum log depth]';
    seen.add(input);
    if (input instanceof Date) return Number.isNaN(input.getTime()) ? '[Invalid date]' : input.toISOString();
    if (Array.isArray(input)) return input.slice(0, 100).map(item => value(item, seen, depth + 1));
    if (input instanceof Error) {
      // Do not dump stacks, request bodies, headers or custom Error fields.
      const ownName = Object.getOwnPropertyDescriptor(input, 'name')?.value;
      const ownMessage = Object.getOwnPropertyDescriptor(input, 'message')?.value;
      const result: Record<string, unknown> = {
        name: typeof ownName === 'string' ? text(ownName) : input instanceof TypeError ? 'TypeError' : input instanceof SyntaxError ? 'SyntaxError' : 'Error',
        message: typeof ownMessage === 'string' ? text(ownMessage) : '[Error message omitted]'
      };
      for (const key of ['code', 'status', 'cause']) {
        const descriptor = Object.getOwnPropertyDescriptor(input, key);
        if (descriptor && 'value' in descriptor) result[key] = value(descriptor.value, seen, depth + 1);
      }
      return result;
    }
    const result: Record<string, unknown> = Object.create(null);
    for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(input)).slice(0, 100)) {
      result[text(key)] = sensitiveKey(key) ? REDACTED : 'value' in descriptor ? value(descriptor.value, seen, depth + 1) : '[Getter omitted]';
    }
    return result;
  };
  const errorMessage = (error: unknown, fallback = 'Request failed'): string => {
    if (typeof error === 'string') return text(error || fallback);
    if (error && typeof error === 'object') {
      try {
        const descriptor = Object.getOwnPropertyDescriptor(error, 'message');
        if (descriptor && typeof descriptor.value === 'string') return text(descriptor.value || fallback);
      } catch { /* hostile objects must not bypass the safe fallback */ }
    }
    return text(fallback);
  };
  return Object.freeze({ text, value: (input: unknown) => value(input), errorMessage });
}

type LogSink = Pick<Console, 'log' | 'warn' | 'error'>;

export function createLogger(options: { secrets?: readonly string[]; sink?: LogSink } = {}) {
  const redactor = createRedactor(options.secrets);
  const sink = options.sink ?? console;
  const write = (level: keyof LogSink, values: unknown[]) => {
    let safe: unknown[];
    try { safe = values.map(redactor.value); }
    catch { safe = ['[RegSonar] Log event omitted: sanitization failed']; }
    // A failed formatter or sink must never fall back to the original values.
    try { sink[level](...safe); } catch { /* logging failure must not crash a request */ }
  };
  return Object.freeze({
    info: (...values: unknown[]) => write('log', values),
    warn: (...values: unknown[]) => write('warn', values),
    error: (...values: unknown[]) => write('error', values),
    errorMessage: redactor.errorMessage,
    redact: redactor.value
  });
}

export const browserLogger = createLogger();
