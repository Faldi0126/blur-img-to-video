const tabs = [...document.querySelectorAll('[role="tab"]')];

function selectTab(tab) {
  for (const t of tabs) {
    const on = t === tab;
    t.setAttribute("aria-selected", on);
    document.getElementById(t.getAttribute("aria-controls")).hidden = !on;
  }
}

for (const t of tabs) t.addEventListener("click", () => selectTab(t));

// Tabs have nothing to show until there is an image.
document.addEventListener("imageloaded", () => {
  document.getElementById("workspace").hidden = false;
});
