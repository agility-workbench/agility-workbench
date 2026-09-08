import { useCallback, useSyncExternalStore } from "react";
import { defaultKnobValues, type KnobValue, type KnobValues } from "./knobs";
import type { DemoFeature } from "./snippets";

/**
 * Knob values, shared between the live example and the code tabs on the same page.
 *
 * The two are siblings in the MDX (`<LiveFeatureGrid>` and `<FrameworkCode>`), with no common
 * React parent to hold state in, so the values live in a module-level store keyed by feature. The
 * store starts every feature at its knob defaults, which is also what the server render prints —
 * the code tabs render during the static build, and only diverge once someone moves a knob.
 */
const values = new Map<DemoFeature, KnobValues>();
const listeners = new Map<DemoFeature, Set<() => void>>();

function read(feature: DemoFeature): KnobValues {
  let current = values.get(feature);
  if (!current) {
    current = defaultKnobValues(feature);
    values.set(feature, current);
  }
  return current;
}

function write(feature: DemoFeature, next: KnobValues) {
  values.set(feature, next);
  listeners.get(feature)?.forEach((listener) => listener());
}

export function useKnobValues(feature: DemoFeature) {
  const subscribe = useCallback((listener: () => void) => {
    let set = listeners.get(feature);
    if (!set) {
      set = new Set();
      listeners.set(feature, set);
    }
    set.add(listener);
    return () => set!.delete(listener);
  }, [feature]);
  const snapshot = useCallback(() => read(feature), [feature]);
  const current = useSyncExternalStore(subscribe, snapshot, snapshot);
  const set = useCallback((id: string, value: KnobValue) => write(feature, { ...read(feature), [id]: value }), [feature]);
  const reset = useCallback(() => write(feature, defaultKnobValues(feature)), [feature]);
  return { values: current, set, reset };
}
