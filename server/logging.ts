// Server-only logger. Never import the configuration or these secret literals
// into browser code; the pure logger in shared/logging.ts is safe to share.
// Each entry is one line of JSON (LOG_FORMAT=text for the plain console form):
// time, level, scope, msg, the deployment and region, the running request's
// or job's context (server/log-context.ts), and any error and data, all
// redacted.
import { config } from '../runtime-config.js';
import { createLogger } from '../shared/logging.js';
import { logContext } from './log-context.js';

const secrets = [config.digest.cronSecret, config.digest.apiKey, ...config.digest.to];
const senderAddress = config.digest.from.match(/<([^<>]+)>/)?.[1] ?? config.digest.from;
secrets.push(senderAddress);
if (config.database.url && config.database.url !== 'pglite') {
  secrets.push(config.database.url);
  const password = new URL(config.database.url).password;
  if (password) {
    secrets.push(password);
    try { secrets.push(decodeURIComponent(password)); } catch { /* use the encoded value */ }
  }
}

export const logger = createLogger({
  secrets: secrets.filter((secret): secret is string => Boolean(secret)),
  format: config.logging.format,
  base: { deployment: config.runtime.deploymentId, ...(config.runtime.region ? { region: config.runtime.region } : {}) },
  context: logContext as () => Record<string, unknown> | undefined
});
