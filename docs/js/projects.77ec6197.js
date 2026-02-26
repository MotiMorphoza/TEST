function initProjectsPage() {
  const listEl = document.getElementById("projects-list");
  if (!listEl || listEl.dataset.initialized === "true") return;

  const manifest = window.__PROJECTS__;

  if (!Array.isArray(manifest) || manifest.length === 0) {
    console.warn("Projects manifest is missing or empty.");
    return;
  }

  listEl.dataset.initialized = "true";

  manifest.forEach((project, index) => {
    if (!project?.slug || !project?.title) return;

    const section = document.createElement("section");
    section.className =
      "project-item " +
      (index % 2 === 0 ? "bg-1" : "bg-2") +
      (index % 2 === 1 ? " reverse" : "");

    const grid = document.createElement("div");
    grid.className = "project-grid";

    const href = `project.html?project=${encodeURIComponent(project.slug)}`;

    const link = document.createElement("a");
    link.href = href;
    link.className = "project-link";

    const media = document.createElement("img");
    media.className = "project-media";
    media.alt = project.title;
    media.loading = index === 0 ? "eager" : "lazy";

    if (project.cover) {
      media.src = `projects/${project.slug}/${project.cover}`;
    } else {
      media.classList.add("placeholder");
    }

    media.onerror = () => {
      media.classList.add("placeholder");
      media.removeAttribute("src");
    };

    link.appendChild(media);

    const textLink = document.createElement("a");
    textLink.href = href;
    textLink.className = "project-text";

    const h2 = document.createElement("h2");
    h2.textContent = project.title;

    const p = document.createElement("p");
    p.innerHTML = `
      ${project.description || ""}
      <span class="enter">ENTER →</span>
    `;

    textLink.appendChild(h2);
    textLink.appendChild(p);

    if (index % 2 === 0) {
      grid.appendChild(link);
      grid.appendChild(textLink);
    } else {
      grid.appendChild(textLink);
      grid.appendChild(link);
    }

    section.appendChild(grid);
    listEl.appendChild(section);

    if (index < manifest.length - 1) {
      const sep = document.createElement("div");
      sep.className = "separator";
      listEl.appendChild(sep);
    }
  });

  /* אחרי שכל ה-DOM נבנה */
  const covers = [...document.querySelectorAll(".project-media")];
  enableProjectsForwardPreload(covers);
  enableDecodeFade(covers);
}

/* ===== Preload 2 קדימה ===== */

function enableProjectsForwardPreload(images) {
  if (!images.length) return;

  const preloaded = new Set();

  const preloadImage = (index) => {
    if (index >= images.length) return;
    if (preloaded.has(index)) return;

    const src = images[index].getAttribute("src");
    if (!src) return;

    const img = new Image();
    img.src = src;

    preloaded.add(index);
  };

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;

        const currentIndex = images.indexOf(entry.target);
        if (currentIndex === -1) return;

        preloadImage(currentIndex + 1);
        preloadImage(currentIndex + 2);
      });
    },
    {
      rootMargin: "777px 0px",
      threshold: 0.1,
    }
  );

  images.forEach((img) => observer.observe(img));
}

/* ===== Decode + Fade ===== */

function enableDecodeFade(images) {
  images.forEach((img) => {
    if (img.complete) {
      img.classList.add("is-ready");
      return;
    }

    img.addEventListener("load", async () => {
      try {
        if (img.decode) {
          await img.decode();
        }
      } catch (e) {}

      img.classList.add("is-ready");
    });
  });
}

window.initProjectsPage = initProjectsPage;
document.addEventListener("DOMContentLoaded", initProjectsPage);