# Action frames

An ActionFrame keeps a visible frame on one cell and mounts application-owned
form content in a persistent popover.

## Click-triggered comment form

```ts
const commentForm = (params: ActionFrameComponentParams) => {
  const form = document.createElement("form");
  const input = document.createElement("textarea");
  const save = document.createElement("button");

  input.value = String(params.value ?? "");
  save.textContent = "Save";
  form.append(input, save);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    params.api.setCellValue(
      { rowId: params.rowId, colId: params.colDef.colId },
      input.value,
    );
    params.close();
  });
  return form;
};

const column = {
  key: "comment",
  label: "Comment",
  actionFrameTrigger: "click",
  actionFrameComponent: commentForm,
  actionFrameIndicator: "comment",
  actionFrameOptions: {
    placement: "right",
    offset: 10,
    escapeRootClip: true,
  },
} satisfies ColDef;
```

`actionFrameIndicator` may also be `true` or a predicate. Use
`defaultColDef.actionFrameComponent` to share a component across columns.

## Theming and `escapeRootClip`

`escapeRootClip: true` mounts the popover in `document.body` so it is not clipped
by the grid's own overflow near the grid edge. The cost is theming: a theme's
values are applied as inline `--pte-*` custom properties on the grid root, and a
body-mounted popover is outside that subtree, so **the `actionFramePopover*`
theme params do not apply to it** — `actionFramePopoverWidth`,
`actionFramePopoverBackgroundColor`, `actionFramePopoverRadius`,
`actionFramePopoverShadow`, and friends are all ignored, and the popover renders
with the stylesheet defaults (300px wide, light surface).

Either keep the popover inside the root:

```ts
actionFrameOptions: { placement: "right", offset: 10 }, // escapeRootClip off
```

or set the variables at document scope, which applies to every grid on the page:

```css
:root {
  --pte-action-frame-popover-width: 420px;
}
```

Tooltips behave the same way under `tooltipOptions.escapeRootClip`.

## Programmatic control

```ts
const cell = { rowId: "task-4", colId: "comment" };

api.openActionFrame(cell);
console.log(api.getActionFrameCell());
api.closeActionFrame();
```

`actionFrameTrigger: "none"` keeps API and Shift+F2 access while disabling the
click trigger. Only one frame can be open; starting an edit closes it. Frames
hide while their cell is scrolled out and return when it becomes visible again.
