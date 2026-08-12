import { act } from "react";
import type { Root } from "react-dom/client";
import { flushPendingReactRootUnmounts } from "./managedReactRoot";

/** Unmount an application test root and drain all nested grid roots inside one act scope. */
export async function unmountTestRoot(root: Root): Promise<void> {
  await act(async () => {
    root.unmount();
    await flushPendingReactRootUnmounts();
  });
}
