import type { ReactNode } from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";

const pendingUnmounts = new Set<Root>();
let unmountScheduled = false;

function flushUnmounts(): void {
  unmountScheduled = false;
  const roots = Array.from(pendingUnmounts);
  pendingUnmounts.clear();
  for (const root of roots) root.unmount();
}

function scheduleUnmount(root: Root): void {
  pendingUnmounts.add(root);
  if (unmountScheduled) return;
  unmountScheduled = true;
  queueMicrotask(flushUnmounts);
}

/**
 * Flush lifecycle-safe nested-root disposal. Production disposal is automatic;
 * this hook lets React tests drain the same queue from inside `act()`.
 */
export async function flushPendingReactRootUnmounts(): Promise<void> {
  await Promise.resolve();
  if (pendingUnmounts.size > 0) flushUnmounts();
  await Promise.resolve();
}

/**
 * Owns a React root mounted inside the grid's imperative DOM. Destroying the
 * host invalidates it synchronously, while the React unmount is deferred until
 * the current outer render/commit has finished.
 */
export class ManagedReactRoot {
  private root: Root | null;

  constructor(container: Element | DocumentFragment) {
    this.root = createRoot(container);
  }

  render(node: ReactNode): void {
    this.root?.render(node);
  }

  renderSync(node: ReactNode): void {
    const root = this.root;
    if (!root) return;
    flushSync(() => root.render(node));
  }

  destroy(): void {
    const root = this.root;
    if (!root) return;
    this.root = null;
    scheduleUnmount(root);
  }
}
