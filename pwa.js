// Service workers are blocked on file://, so skip it when the page is opened by double-click.
if ("serviceWorker" in navigator && location.protocol !== "file:") {
  navigator.serviceWorker.register("sw.js");
}
