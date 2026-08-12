import React from "react";
import Link from "@docusaurus/Link";
import Layout from "@theme/Layout";
import { LiveFeatureGrid } from "../components/LiveFeatureGrid";
import styles from "./index.module.css";

const features = [
  ["01", "Work at scale", "Virtualized rendering, lazy server blocks, pinned sections, and predictable updates."],
  ["02", "Shape the data", "Filtering, multi-sort, grouping, tree data, aggregation, pagination, and saved views."],
  ["03", "Edit like a workspace", "Typed editors, ranges, clipboard workflows, keyboard navigation, undo, and redo."],
  ["04", "Ship every framework", "A dependency-free core with first-party React and Angular adapters."],
  ["05", "Export the real view", "CSV and native Excel output with groups, formulas, spans, panes, and selections."],
  ["06", "Make it yours", "Per-instance themes, custom components, menus, tooltips, icons, and cell actions."],
];

export default function Home() {
  return (
    <Layout title="The composable data grid" description="Agility Workbench is a fast TypeScript data grid for React, Angular, and framework-neutral applications.">
      <main>
        <header className={styles.hero}>
          <div className={`container ${styles.heroInner}`}>
            <div className={styles.eyebrow}><span className={styles.spark} />Core · React · Angular</div>
            <h1 className={styles.title}>Data grids that move at <span className={styles.titleAccent}>your speed.</span></h1>
            <p className={styles.lead}>A fast, composable TypeScript grid for building serious data workspaces—without handing your product over to a black box.</p>
            <div className={styles.actions}>
              <Link className={styles.primary} to="/docs/getting-started/installation">Start building →</Link>
              <Link className={styles.secondary} to="/docs/examples/columns">Explore examples</Link>
            </div>
            <div className={styles.trust}><span>Zero-dependency core</span><span>Virtualized by default</span><span>MIT licensed</span><span>Fully typed</span></div>
          </div>
        </header>

        <section className={styles.demoSection}>
          <div className="container">
            <div className={styles.sectionHead}>
              <div><div className="awb-kicker">Built to be handled</div><h2>Try the grid, not a screenshot.</h2></div>
              <p>Resize columns, move them, search the data, open the column panel, and explore the same APIs used by the framework bindings.</p>
            </div>
            <LiveFeatureGrid feature="columns" compact />
          </div>
        </section>

        <section className={styles.features}>
          <div className="container">
            <div className="awb-kicker">One engine, complete workflows</div>
            <div className={styles.featureGrid}>
              {features.map(([number, title, copy]) => (
                <article className={styles.feature} key={number}>
                  <div className={styles.featureNum}>{number}</div>
                  <h3>{title}</h3>
                  <p>{copy}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className={styles.cta}>
          <div className="container">
            <h2>Build the workspace your data deserves.</h2>
            <p>Start with a framework binding, keep access to the entire core API, and grow into advanced workflows only when you need them.</p>
            <Link className={styles.primary} to="/docs/getting-started/installation">Read the documentation →</Link>
          </div>
        </section>
      </main>
    </Layout>
  );
}
