document.addEventListener("DOMContentLoaded", () => {
  const bg = document.querySelector(".landing-bg");
  if (bg) {
    const manifest = window.__MANIFEST__?.landing;

    if (manifest) {
      const isNarrow = window.innerWidth < 700;
      const isPortrait = window.innerHeight > window.innerWidth;

      let images = [];

      if ((isNarrow || isPortrait) && manifest.mobile?.length) {
        images = manifest.mobile;
      } else if (manifest.desktop?.length) {
        images = manifest.desktop;
      }

      if (images.length) {
        const randomImage = images[Math.floor(Math.random() * images.length)];

        bg.style.backgroundImage = `url(${randomImage})`;

        const link = document.createElement("link");
        link.rel = "preload";
        link.as = "image";
        link.href = randomImage;
        document.head.appendChild(link);
      }
    }
  }

  const enter = document.getElementById("enterBtn");

  if (enter) {
    enter.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();

      try {
        await document.documentElement.requestFullscreen();
      } catch (err) {
        // Browser can reject fullscreen; continue with navigation.
      }

      const landingOverlay = document.getElementById("landing-overlay");
      if (landingOverlay) {
        landingOverlay.remove();
      }

      if (typeof window.loadPage === "function") {
        window.loadPage(enter.getAttribute("href"));
      } else {
        window.location.href = enter.getAttribute("href");
      }
    });
  }
});
