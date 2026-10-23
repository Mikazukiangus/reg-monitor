// Circuit breakers for services that fail slowly: a regulator site that has
// stopped answering, or the history database. After `threshold` failures in a
// row the circuit opens and calls are refused at once, instead of each waiting
// out its time limit, for `cooldownMs`. Then one call is let through as a
// trial: if it works the circuit closes, if not it opens for another cooldown.
// State is kept in memory, per server instance, like the rate limits.
import { logger } from './logging.js';

export class CircuitOpenError extends Error {}

// What a call's outcome says about the service: a failure (with its reason),
// or undefined when it says nothing either way (an address we refused to
// visit, a site's own rate limit) and is not counted
export interface Judge<T> {
  result?: (result: T) => string | undefined;
  error: (err: unknown) => string | undefined;
}

const clock = (ms: number) => new Date(ms).toISOString().slice(11, 16);

export class CircuitBreaker {
  private failures = 0;
  private lastFailure = '';
  private openUntil = 0;
  private trialRunning = false;
  private running = 0;

  constructor(readonly name: string, private readonly threshold: number, private readonly cooldownMs: number, private readonly now = Date.now) {}

  // Closed, no failures counted and no call under way: nothing to remember
  get idle() { return this.running === 0 && this.failures === 0 && this.openUntil === 0; }

  // `probe` (an endpoint status check) is let through even when open, so the
  // status page reports the service as it is; its outcome is counted as usual
  async run<T>(call: () => Promise<T>, judge: Judge<T>, { probe = false } = {}): Promise<T> {
    const trial = probe ? false : this.admit();
    this.running++;
    try {
      const result = await call();
      const failure = judge.result?.(result);
      if (failure) this.failed(failure); else this.succeeded();
      return result;
    } catch (err) {
      const failure = err instanceof CircuitOpenError ? undefined : judge.error(err);
      if (failure) this.failed(failure);
      throw err;
    } finally {
      this.running--;
      if (trial) this.trialRunning = false;
    }
  }

  // Refuses a call while open, and while another call is the trial; returns
  // whether this call is the trial
  private admit(): boolean {
    if (this.openUntil === 0) return false;
    const refused = `Not asked: ${this.name} failed ${this.failures} times in a row (last: ${this.lastFailure})`;
    if (this.now() < this.openUntil) throw new CircuitOpenError(`${refused}; asking again after ${clock(this.openUntil)} UTC`);
    if (this.trialRunning) throw new CircuitOpenError(`${refused}; a trial request is under way`);
    this.trialRunning = true;
    return true;
  }

  private failed(reason: string) {
    this.failures++;
    this.lastFailure = reason;
    // A failed trial opens it again straight away
    if (this.openUntil === 0 && this.failures < this.threshold) return;
    const reopened = this.openUntil !== 0;
    this.openUntil = this.now() + this.cooldownMs;
    logger.warn(`[RegSonar] ${this.name}: ${this.failures} failures in a row (last: ${reason}); ${reopened ? 'still failing, ' : ''}not asking again until ${clock(this.openUntil)} UTC`);
  }

  private succeeded() {
    if (this.openUntil !== 0) logger.info(`[RegSonar] ${this.name} is answering again`);
    this.failures = 0;
    this.openUntil = 0;
  }
}
