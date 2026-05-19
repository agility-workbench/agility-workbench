export function createLoadingOverlay(): HTMLDivElement {
  const overlay = document.createElement("div");
  overlay.className = "pte-loading-overlay hidden";

  const spinner = document.createElement("div");
  spinner.className = "pte-loading-spinner";

  const label = document.createElement("div");
  label.className = "pte-loading-label";
  label.textContent = "Loading data...";

  overlay.appendChild(spinner);
  overlay.appendChild(label);

  return overlay;
}
