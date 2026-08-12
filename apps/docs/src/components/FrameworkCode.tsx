import React from "react";
import CodeBlock from "@theme/CodeBlock";
import Tabs from "@theme/Tabs";
import TabItem from "@theme/TabItem";
import { snippets, type DemoFeature } from "./snippets";

export function FrameworkCode({ feature }: { feature: DemoFeature }) {
  const code = snippets[feature];
  return (
    <Tabs groupId="framework" queryString="framework">
      <TabItem value="react" label="React" default>
        <CodeBlock language="tsx" title="React">{code.react}</CodeBlock>
      </TabItem>
      <TabItem value="angular" label="Angular">
        <CodeBlock language="typescript" title="Angular">{code.angular}</CodeBlock>
      </TabItem>
      <TabItem value="core" label="Core TypeScript">
        <CodeBlock language="typescript" title="Framework-neutral">{code.core}</CodeBlock>
      </TabItem>
    </Tabs>
  );
}
