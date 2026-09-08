import React from "react";
import CodeBlock from "@theme/CodeBlock";
import Tabs from "@theme/Tabs";
import TabItem from "@theme/TabItem";
import { knobOptions } from "./knobs";
import { useKnobValues } from "./knobStore";
import { fillOptions } from "./optionsCode";
import { snippets, type DemoFeature } from "./snippets";

/**
 * The framework code tabs. The configurable options print from the live example's knob values
 * (shared through `knobStore`), so the code follows whatever the frame above is set to.
 */
export function FrameworkCode({ feature }: { feature: DemoFeature }) {
  const code = snippets[feature];
  const { values } = useKnobValues(feature);
  const options = knobOptions(feature, values);
  return (
    <Tabs groupId="framework" queryString="framework">
      <TabItem value="react" label="React" default>
        <CodeBlock language="tsx" title="React">{fillOptions(code.react, options, "react")}</CodeBlock>
      </TabItem>
      <TabItem value="angular" label="Angular">
        <CodeBlock language="typescript" title="Angular">{fillOptions(code.angular, options, "angular")}</CodeBlock>
      </TabItem>
      <TabItem value="core" label="Core TypeScript">
        <CodeBlock language="typescript" title="Framework-neutral">{fillOptions(code.core, options, "core")}</CodeBlock>
      </TabItem>
    </Tabs>
  );
}
