// Needs selectTab from tabs.js.
const modeHome = document.getElementById("mode-home");
const homeBtn = document.getElementById("home");
const modeSections = [...document.querySelectorAll('main > section[id^="mode-"]')];

function showMode(id) {
  for (const s of modeSections) s.hidden = s.id !== id;
  homeBtn.hidden = id === "mode-home";
}

for (const card of modeHome.querySelectorAll(".mode")) {
  card.addEventListener("click", () => {
    showMode(`mode-${card.dataset.mode}`);
    // Bokeh and video share one image, so they stay one screen with tabs.
    if (card.dataset.tab) selectTab(document.getElementById(card.dataset.tab));
  });
}

homeBtn.addEventListener("click", () => showMode("mode-home"));
