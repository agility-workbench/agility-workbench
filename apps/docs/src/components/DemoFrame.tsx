import React, { type ReactNode } from "react";
import clsx from "clsx";
import styles from "./DemoFrame.module.css";

export function DemoFrame({ label, hint, compact, actions, children }: {
  label: string;
  hint: string;
  compact?: boolean;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className={clsx(styles.frame, compact && styles.compact)}>
      <div className={styles.topbar}>
        <div className={styles.label}><span className={styles.pulse} />Live example · {label}</div>
        <div className={styles.meta}>
          <div className={styles.hint}>{hint}</div>
          {actions}
        </div>
      </div>
      <div className={styles.canvas}>{children}</div>
    </section>
  );
}
