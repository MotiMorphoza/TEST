// build/head-orchestrator.js
'use strict';

class HeadOrchestrator {
  constructor({ logger, renameMap, manifestData, version, assets, htmlFile }) {
    this.logger       = logger;
    this.renameMap    = renameMap;
    this.manifestData = manifestData;
    this.version      = version;
    this.assets       = assets || {};
    this.htmlFile     = htmlFile;
  }

  buildHead(html) {
    const headMatch = html.match(/(<head[^>]*>)([\s\S]*?)(<\/head>)/i);
    if (!headMatch) throw new Error(`No <head> tag found in ${this.htmlFile}`);

    const [fullHead, openTag, innerContent, closeTag] = headMatch;

    const tags = [];

    // ── BASE META ──────────────────────────────────────────
    tags.push('<meta charset="UTF-8">');
    tags.push('<meta name="viewport" content="width=device-width, initial-scale=1">');
    tags.push('<meta name="theme-color" content="#000000">');

    // ── TITLE ─────────────────────────────────────────────
    const titleMatch = innerContent.match(/<title>[\s\S]*?<\/title>/i);
    const titleTag   = titleMatch ? titleMatch[0] : '<title>MotoSynteza</title>';
    tags.push(titleTag);
    const cleanTitle = titleTag.replace(/<\/?title>/gi, '').trim();

    // ── DESCRIPTION ───────────────────────────────────────
    const description =
      this.extractMeta(innerContent, 'description') ||
      'MotoSynteza – conceptual photography and visual storytelling.';
    tags.push(`<meta name="description" content="${description}">`);

    // ── CANONICAL ─────────────────────────────────────────
    const canonical = this.buildCanonical();
    if (canonical) tags.push(`<link rel="canonical" href="${canonical}">`);

    // ── OPEN GRAPH ────────────────────────────────────────
    tags.push(`<meta property="og:title" content="${cleanTitle}">`);
    tags.push(`<meta property="og:description" content="${description}">`);
    tags.push('<meta property="og:type" content="website">');
    if (canonical) tags.push(`<meta property="og:url" content="${canonical}">`);

    const ogImage = this.getOgImage();
    if (ogImage) tags.push(`<meta property="og:image" content="${ogImage}">`);

    // ── TWITTER CARD ──────────────────────────────────────
    tags.push('<meta name="twitter:card" content="summary_large_image">');
    tags.push(`<meta name="twitter:title" content="${cleanTitle}">`);
    tags.push(`<meta name="twitter:description" content="${description}">`);
    if (ogImage) tags.push(`<meta name="twitter:image" content="${ogImage}">`);

    // ── CSS ───────────────────────────────────────────────
    const mainCss = this.getMainCss();
    if (mainCss) {
      tags.push(`<link rel="stylesheet" href="${mainCss}">`);
      tags.push(`<link rel="preload" href="${mainCss}" as="style">`);
    }

    // Shop-specific CSS (only injected on shop.html)
    const shopCss = this.getShopCss();
    if (shopCss) {
      tags.push(`<link rel="stylesheet" href="${shopCss}">`);
    }

    // ── FAVICONS ──────────────────────────────────────────
    tags.push(...this.buildFavicons());

    // ── HERO IMAGE PRELOAD ────────────────────────────────
    const heroPreload = this.getHeroPreload();
    if (heroPreload) tags.push(heroPreload);

    // ── VERSION SCRIPT ───────────────────────────────────
    if (this.assets.versionScriptPath) {
      tags.push(`<script src="${this.assets.versionScriptPath}"></script>`);
    }

    // ── OTHER HEAD SCRIPTS ───────────────────────────────
    const headScripts =
      innerContent.match(/<script[^>]*src=["'][^"']+["'][^>]*><\/script>/gi) || [];
    headScripts
      .filter(s => !/build-version\./i.test(s))
      .forEach(s => tags.push(s));

    // ── CSP ───────────────────────────────────────────────
    if (this.assets.cspPolicy) {
      tags.push(
        `<meta http-equiv="Content-Security-Policy" content="${this.assets.cspPolicy}">`
      );
    }

    const newHead =
      openTag + '\n' +
      tags.map(t => `  ${t}`).join('\n') + '\n' +
      closeTag;

    return html.replace(fullHead, newHead);
  }

  // ── HELPERS ───────────────────────────────────────────────

  extractMeta(content, name) {
    const match = content.match(
      new RegExp(
        `<meta[^>]*name=["']${name}["'][^>]*content=["']([^"']+)["'][^>]*>`, 'i'
      )
    );
    return match ? match[1] : null;
  }

  buildCanonical() {
    const base     = 'https://motimorphoza.github.io/MotoSynteza/';
    const fileName = this.htmlFile.split(/[\\/]/).pop();
    return base + fileName;
  }

  // Returns the single hashed main CSS (style.*)
  getMainCss() {
    for (const [oldPath, newPath] of this.renameMap.entries()) {
      if (
        oldPath.startsWith('css/') &&
        oldPath.endsWith('.css') &&
        !oldPath.toLowerCase().includes('shop')
      ) {
        return newPath;
      }
    }
    return null;
  }

  // Returns the hashed shop CSS – only for shop.html
  getShopCss() {
    if (!this.isShop()) return null;
    for (const [oldPath, newPath] of this.renameMap.entries()) {
      if (oldPath.toLowerCase().includes('shop') && oldPath.endsWith('.css')) {
        return newPath;
      }
    }
    return null;
  }

  buildFavicons() {
    const tags = [];
    for (const [oldPath, newPath] of this.renameMap.entries()) {
      if (!oldPath.toLowerCase().includes('favicon')) continue;
      if (oldPath.includes('32'))              tags.push(`<link rel="icon" type="image/png" sizes="32x32" href="${newPath}">`);
      if (oldPath.includes('180'))             tags.push(`<link rel="apple-touch-icon" sizes="180x180" href="${newPath}">`);
      if (oldPath.includes('512'))             tags.push(`<link rel="icon" type="image/png" sizes="512x512" href="${newPath}">`);
      if (/favicon\.png$/i.test(oldPath))      tags.push(`<link rel="icon" href="${newPath}">`);
    }
    return tags;
  }

  // ── OG IMAGE ─────────────────────────────────────────────
  getOgImage() {
    const base = 'https://motimorphoza.github.io/MotoSynteza/';

    // Project page: use first image of that project
    if (this.isProject() && Array.isArray(this.manifestData?.projects)) {
      const key     = this.htmlFile.split(/[\\/]/).pop().replace('project-', '').replace('.html', '');
      const project = this.manifestData.projects.find(p => p.slug === key);
      if (project?.images?.length) {
        const first    = project.images[0];
        const resolved = this.renameMap.get(first) || first;
        return base + resolved;
      }
    }

    // Fallback: any og-cover image
    for (const [oldPath, newPath] of this.renameMap.entries()) {
      if (oldPath.includes('og-cover')) return base + newPath;
    }

    return null;
  }

  // ── HERO PRELOAD ─────────────────────────────────────────
  // Handles both old (flat array) and new { desktop, mobile } manifest structure
  getHeroPreload() {
    if (this.isLanding()) {
      const landing = this.manifestData?.landing;
      if (!landing) return null;

      const images = Array.isArray(landing)
        ? landing
        : (landing.desktop || landing.mobile || []);

      if (!images.length) return null;
      const resolved = this.renameMap.get(images[0]) || images[0];
      return `<link rel="preload" href="${resolved}" as="image">`;
    }

    if (this.isMain()) {
      const main = this.manifestData?.main;
      if (!Array.isArray(main) || !main.length) return null;
      const resolved = this.renameMap.get(main[0]) || main[0];
      return `<link rel="preload" href="${resolved}" as="image">`;
    }

    return null;
  }

  // ── PAGE DETECTORS ────────────────────────────────────────
  isLanding()  { return this.htmlFile.endsWith('index.html'); }
  isMain()     { return this.htmlFile.endsWith('main.html'); }
  isProject()  { return this.htmlFile.includes('project-'); }
  isShop()     { return this.htmlFile.endsWith('shop.html'); }
}

module.exports = HeadOrchestrator;
