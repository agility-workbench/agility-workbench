import { provideZonelessChangeDetection } from "@angular/core";
import { bootstrapApplication } from "@angular/platform-browser";
// The grid stylesheet is not auto-injected by the wrapper; consumers (and this demo) import it
// explicitly. In a published app this would be `import "@agility-workbench/grid/styles.css"`.
import "@grid/theme/table.css";
import "./style.css";
import { AppComponent } from "./app.component";

// The playground runs zoneless on purpose: it proves the wrapper needs no zone.js. The wrapper
// works identically in zone-based apps.
bootstrapApplication(AppComponent, {
  providers: [provideZonelessChangeDetection()],
}).catch((err) => console.error(err));
