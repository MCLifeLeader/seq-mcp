import { performance } from "node:perf_hooks";

export const DEFAULT_IDLE_TIMEOUT_MS = 900_000;

export function loadIdleTimeoutMs(): number {
    const raw = process.env.MCP_IDLE_TIMEOUT_MS;
    if (raw === undefined) return DEFAULT_IDLE_TIMEOUT_MS;
    const value = /^\d+$/.test(raw) ? Number(raw) : Number.NaN;
    if (!Number.isInteger(value) || value < 1 || value > 2_147_483_647) {
        throw new Error(
            "Invalid MCP_IDLE_TIMEOUT_MS: expected an integer from 1 to 2147483647 milliseconds.",
        );
    }
    return value;
}

/** A monotonic idle deadline, independent of system clock adjustments. */
export class IdleLifetime {
    private deadline = 0;
    private timer: ReturnType<typeof setTimeout> | undefined;

    constructor(
        private readonly idleTimeoutMs: number,
        private readonly onExpire: () => void,
    ) {
        this.reset();
    }

    reset(): void {
        this.stop();
        this.deadline = performance.now() + this.idleTimeoutMs;
        this.timer = setTimeout(() => {
            this.timer = undefined;
            this.onExpire();
        }, this.idleTimeoutMs);
    }

    status(): { idleTimeoutMs: number; remainingMs: number } {
        return {
            idleTimeoutMs: this.idleTimeoutMs,
            remainingMs: Math.max(
                0,
                Math.ceil(this.deadline - performance.now()),
            ),
        };
    }

    stop(): void {
        clearTimeout(this.timer);
        this.timer = undefined;
    }
}
