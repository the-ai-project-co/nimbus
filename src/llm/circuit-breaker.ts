/**
 * Provider Circuit Breaker
 *
 * Prevents cascading failures by tracking consecutive errors per provider.
 * When a provider fails too many times in a row, its circuit "opens" and
 * requests are skipped until a cooldown period elapses. After cooldown the
 * circuit enters HALF_OPEN, allowing a single probe request to determine
 * whether the provider has recovered.
 *
 * States:
 *   CLOSED    → normal operation (all requests pass through)
 *   OPEN      → provider is failing; skip until cooldown expires
 *   HALF_OPEN → cooldown elapsed; allow one probe request
 */

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

interface ProviderCircuit {
  state: CircuitState;
  failures: number;
  lastFailure: number;
}

const DEFAULT_FAILURE_THRESHOLD = 5;
const DEFAULT_COOLDOWN_MS = 60_000; // 60 seconds

export class ProviderCircuitBreaker {
  private circuits: Map<string, ProviderCircuit> = new Map();
  private failureThreshold: number;
  private cooldownMs: number;

  constructor(opts?: { failureThreshold?: number; cooldownMs?: number }) {
    this.failureThreshold = opts?.failureThreshold ?? DEFAULT_FAILURE_THRESHOLD;
    this.cooldownMs = opts?.cooldownMs ?? DEFAULT_COOLDOWN_MS;
  }

  /**
   * Check whether a provider is available for requests.
   * Returns false only when the circuit is OPEN and cooldown hasn't elapsed.
   */
  isAvailable(provider: string): boolean {
    const circuit = this.circuits.get(provider);
    if (!circuit) {
      return true;
    }

    if (circuit.state === 'CLOSED') {
      return true;
    }

    if (circuit.state === 'OPEN') {
      const elapsed = Date.now() - circuit.lastFailure;
      if (elapsed >= this.cooldownMs) {
        // Transition to HALF_OPEN: allow a single probe
        circuit.state = 'HALF_OPEN';
        return true;
      }
      return false;
    }

    // HALF_OPEN: allow probe
    return true;
  }

  /**
   * Record a successful request. Resets the circuit to CLOSED.
   */
  recordSuccess(provider: string): void {
    const circuit = this.circuits.get(provider);
    if (circuit) {
      circuit.state = 'CLOSED';
      circuit.failures = 0;
    }
  }

  /**
   * Record a failed request. Increments the failure counter and may
   * open the circuit if the threshold is exceeded.
   */
  recordFailure(provider: string): void {
    let circuit = this.circuits.get(provider);
    if (!circuit) {
      circuit = { state: 'CLOSED', failures: 0, lastFailure: 0 };
      this.circuits.set(provider, circuit);
    }

    circuit.failures++;
    circuit.lastFailure = Date.now();

    if (circuit.failures >= this.failureThreshold && circuit.state !== 'OPEN') {
      circuit.state = 'OPEN';
      // Emit a visible warning when a provider circuit opens
      if (process.stderr.isTTY) {
        process.stderr.write(
          `\x1b[33m  Warning: Provider '${provider}' disabled after ${this.failureThreshold} consecutive failures. Will retry in ${Math.round(this.cooldownMs / 1000)}s.\x1b[0m\n`
        );
      }
    } else if (circuit.failures >= this.failureThreshold) {
      circuit.state = 'OPEN';
    }
  }

  /**
   * Get the current state of a provider's circuit.
   */
  getState(provider: string): CircuitState {
    return this.circuits.get(provider)?.state ?? 'CLOSED';
  }

  /**
   * Reset a specific provider's circuit (e.g., after manual recovery).
   */
  reset(provider: string): void {
    this.circuits.delete(provider);
  }

  /**
   * Reset all circuits.
   */
  resetAll(): void {
    this.circuits.clear();
  }

  /**
   * Get the names of all providers whose circuits are currently OPEN.
   * Useful for surfacing circuit breaker state in the TUI.
   */
  getOpenCircuits(): string[] {
    const open: string[] = [];
    for (const [name, circuit] of this.circuits) {
      if (circuit.state === 'OPEN') {
        const elapsed = Date.now() - circuit.lastFailure;
        if (elapsed < this.cooldownMs) {
          open.push(name);
        }
      }
    }
    return open;
  }
}
