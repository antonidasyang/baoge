const controllers = new Map<string, AbortController>();

export function registerAbort(requestId: string): AbortController {
  const ctrl = new AbortController();
  controllers.set(requestId, ctrl);
  return ctrl;
}

export function abortRequest(requestId: string): boolean {
  const ctrl = controllers.get(requestId);
  if (!ctrl) return false;
  ctrl.abort();
  controllers.delete(requestId);
  return true;
}

export function getController(requestId: string): AbortController | undefined {
  return controllers.get(requestId);
}

export function removeAbort(requestId: string): void {
  controllers.delete(requestId);
}
