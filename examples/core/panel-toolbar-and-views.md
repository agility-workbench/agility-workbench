# Column panel, toolbar, and saved views

## Column panel

```ts
const options = {
  columnPanel: {
    trigger: "rail",
    defaultOpen: false,
    width: 320,
  },
} satisfies GridOptions;
```

Change `trigger` to `"header"`, `"menu"`, `"footer"`, or `"toolbar"`.
The drawer provides search, show/hide, pinning, pointer/keyboard ordering, bulk
visibility, nested groups, and reset. Opt a column out with
`suppressColumnPanel: true`.

## Toolbar sections

```ts
const options = {
  toolbar: {
    grouping: true,
    sorting: true,
    quickFilter: true,
    views: true,
    export: true,
  },
  columnPanel: { trigger: "toolbar" },
} satisfies GridOptions;
```

Every section is independently opt-in. The toolbar observes the grid container
and automatically collapses labels and moves secondary commands into an
overflow menu as space shrinks.

## Application-owned saved views

```ts
let views: SavedGridView[] = loadViews();
let activeViewId: string | null = null;

const options = {
  toolbar: { views: true },
  savedViews: {
    views,
    activeViewId,
    onChange: (nextViews) => {
      views = nextViews;
      localStorage.setItem("grid-views", JSON.stringify(nextViews));
    },
    onActiveViewChange: (id) => {
      activeViewId = id;
    },
  },
} satisfies GridOptions;
```

The application owns persistence; the grid supplies picker and CRUD behavior.
A view contains column layout, grouping, sorting, filters, quick-filter text,
and group expansion.

## Capture and apply view state directly

```ts
const state = api.captureViewState();
localStorage.setItem("orders-view", JSON.stringify(state));

api.applyViewState(state);                       // exact column restore
api.applyViewState(state, { columns: "merge" }); // retain later columns
```
