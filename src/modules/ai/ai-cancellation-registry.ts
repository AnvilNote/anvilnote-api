import { HttpError } from "../../lib/http-error";

export class AIRequestCancellationRegistry {
  private readonly active = new Map<string, AbortController>();

  start(requestId: string, callerSignal?: AbortSignal): AbortSignal {
    if (this.active.has(requestId)) {
      throw new HttpError(409, "An AI request with this ID is already active.", {
        code: "invalid_request",
        messageKey: "ai.errors.duplicate_request_id",
        retryable: false,
      });
    }
    const controller = new AbortController();
    if (callerSignal?.aborted) controller.abort();
    else callerSignal?.addEventListener("abort", () => controller.abort(), { once: true });
    this.active.set(requestId, controller);
    return controller.signal;
  }

  cancel(requestId: string): boolean {
    const controller = this.active.get(requestId);
    if (!controller) return false;
    controller.abort();
    return true;
  }

  finish(requestId: string): void {
    this.active.delete(requestId);
  }
}
