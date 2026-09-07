import React from "react";
import styles from "./DemoFrame.module.css";
import { defaultKnobValues, featureKnobs, type KnobDef, type KnobValue } from "./knobs";
import { useKnobValues } from "./knobStore";
import type { DemoFeature } from "./snippets";

/**
 * The control bar for a feature's knobs. Values live in `knobStore`, so the code tabs on the same
 * page print whatever is set here.
 */
export function KnobBar({ feature }: { feature: DemoFeature }) {
  const spec = featureKnobs[feature];
  const { values, set, reset } = useKnobValues(feature);
  if (!spec || spec.knobs.length === 0) return null;
  const defaults = defaultKnobValues(feature);
  const dirty = spec.knobs.some((knob) => values[knob.id] !== defaults[knob.id]);
  return (
    <>
      {spec.knobs.map((knob) => (
        <Knob key={knob.id} knob={knob} value={values[knob.id]} onChange={(value) => set(knob.id, value)} />
      ))}
      {dirty && (
        <button type="button" className={styles.reset} onClick={reset}>
          Reset
        </button>
      )}
    </>
  );
}

function Knob({ knob, value, onChange }: { knob: KnobDef; value: KnobValue; onChange: (value: KnobValue) => void }) {
  const title = knob.hint ?? (knob.structural ? "Fixed at construction — changing it creates a new grid" : undefined);
  const suffix = knob.structural ? <span className={styles.structural} aria-hidden="true">↻</span> : null;
  switch (knob.kind) {
    case "toggle":
      return (
        <label className={styles.knob} title={title}>
          <input type="checkbox" checked={value === true} onChange={(event) => onChange(event.target.checked)} />
          {knob.label}
          {suffix}
        </label>
      );
    case "select":
      return (
        <label className={styles.knob} title={title}>
          {knob.label}
          <select value={String(value)} onChange={(event) => onChange(event.target.value)}>
            {knob.options.map((option) => (
              <option key={option.value} value={option.value}>{option.label ?? option.value}</option>
            ))}
          </select>
          {suffix}
        </label>
      );
    case "number":
      return (
        <label className={styles.knob} title={title}>
          {knob.label}
          <input
            type="number"
            value={Number(value)}
            min={knob.min}
            max={knob.max}
            step={knob.step}
            onChange={(event) => onChange(Number(event.target.value))}
          />
          {suffix}
        </label>
      );
  }
}
