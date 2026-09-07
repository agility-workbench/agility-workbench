import React, { type ReactNode } from "react";
import styles from "./ShowcaseFrame.module.css";

export type ShowcaseStat = { label: string; value: string };

/**
 * Chrome shared by the showcase demos: a heading, an optional live stat strip, a control bar, and
 * a tall grid canvas. Feature-example pages use the smaller `DemoFrame` instead.
 */
export function ShowcaseFrame({ kicker, title, hint, stats, controls, note, children }: {
  kicker: string;
  title: string;
  hint: string;
  stats?: ShowcaseStat[];
  controls?: ReactNode;
  note?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className={styles.frame}>
      <div className={styles.topbar}>
        <div className={styles.heading}>
          <div className={styles.kicker}><span className={styles.pulse} />{kicker}</div>
          <h3 className={styles.title}>{title}</h3>
          <p className={styles.hint}>{hint}</p>
        </div>
        {stats && stats.length > 0 && (
          <div className={styles.stats} aria-live="polite">
            {stats.map((stat) => (
              <div className={styles.stat} key={stat.label}>
                <span className={styles.statValue}>{stat.value}</span>
                <span className={styles.statLabel}>{stat.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      {controls && <div className={styles.controls}>{controls}</div>}
      <div className={styles.canvas}>{children}</div>
      {note && <div className={styles.note}>{note}</div>}
    </section>
  );
}

export const showcaseButtonClass = styles.button;
