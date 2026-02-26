// build/shop-index-generator.js
// Generates docs/index.json — the shop's canonical data source.
// Contains all project codes, image codes, and folder paths.
'use strict';

const fs   = require('fs');
const path = require('path');

class ShopIndexGenerator {
  constructor(logger) {
    this.logger = logger;
  }

  // ─────────────────────────────────────────────────────────
  // Code derivation
  // "unusual-usual"     → "UU"
  // "brutalism-series"  → "BS"
  // "light-experiments" → "LE"
  // ─────────────────────────────────────────────────────────
  deriveProjectCode(slug) {
    return slug
      .split('-')
      .filter(Boolean)
      .map(word => word.charAt(0).toUpperCase())
      .join('');
  }

  // Collision-safe: if two slugs produce the same initials, append 2, 3…
  ensureUnique(base, usedCodes) {
    if (!usedCodes.has(base)) {
      usedCodes.add(base);
      return base;
    }
    let n = 2;
    while (usedCodes.has(`${base}${n}`)) n++;
    const unique = `${base}${n}`;
    usedCodes.add(unique);
    return unique;
  }

  // ─────────────────────────────────────────────────────────
  // Main generation
  // projects: output of Scanner.scanProjectsFromRoot()
  // outputPath: destination inside build temp (e.g. .build-temp/index.json)
  // ─────────────────────────────────────────────────────────
  generate(projects, outputPath) {
    if (!Array.isArray(projects)) {
      throw new Error('ShopIndexGenerator: projects must be an array');
    }

    const usedCodes = new Set();

    const index = {
      generated : new Date().toISOString(),
      version   : '1.0',
      projects  : projects.map(project => {
        // Validate required scanner fields
        if (!project.slug)              throw new Error(`Shop index: project missing slug`);
        if (!Array.isArray(project.images)) throw new Error(`Shop index: project "${project.slug}" missing images`);

        const raw         = this.deriveProjectCode(project.slug);
        const projectCode = this.ensureUnique(raw, usedCodes);

        const images = project.images.map((image, i) => {
          if (!image.src) throw new Error(
            `Shop index: project "${project.slug}" image[${i}] missing src`
          );
          return {
            code    : `${projectCode}-${String(i + 1).padStart(3, '0')}`,
            src     : image.src,
            caption : image.caption || ''
          };
        });

        return {
          projectCode,
          slug        : project.slug,
          title       : project.title,
          description : project.description || '',
          folder      : `projects/${project.slug}`,
          cover       : images[0]?.src || '',
          images
        };
      })
    };

    // Write
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    fs.writeFileSync(outputPath, JSON.stringify(index, null, 2), 'utf8');
    this.logger.info(
      `Generated shop index: ${path.relative(process.cwd(), outputPath)} ` +
      `(${index.projects.length} projects)`
    );

    return index;
  }
}

module.exports = ShopIndexGenerator;
