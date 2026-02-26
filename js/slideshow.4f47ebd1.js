function initSlideshow() {
  const viewport = document.querySelector("[data-slideshow]");
  if (!viewport) return;

  if (viewport.dataset.initialized === "true") return;
  viewport.dataset.initialized = "true";

  viewport.innerHTML = "";

  const manifest = window.__MANIFEST__?.main || [];
  if (!manifest.length) return;

  const slideA = document.createElement("img");
  const slideB = document.createElement("img");

  slideA.className = "slide active";
  slideB.className = "slide";

  viewport.appendChild(slideA);
  viewport.appendChild(slideB);

  let current = slideA;
  let next = slideB;
  let index = 0;
  let interval = null;
  const DURATION = 3333;

  current.src = manifest[0];
  preload(1);

  function change() {
    index = (index + 1) % manifest.length;
    const newSrc = manifest[index];

    next.src = newSrc;

    current.classList.remove("active");
    next.classList.add("active");

    [current, next] = [next, current];

    preload(index + 1);
  }

  function preload(i) {
    const img = new Image();
    img.src = manifest[i % manifest.length];
  }

  function start() {
    if (interval) return;
    interval = setInterval(change, DURATION);
  }

  function stop() {
    if (!interval) return;
    clearInterval(interval);
    interval = null;
  }

  viewport.addEventListener("click", () => {
    change();
  });

  start();
}

window.initSlideshow = initSlideshow;
document.addEventListener("DOMContentLoaded", initSlideshow);
