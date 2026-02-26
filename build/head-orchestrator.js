// build/head-orchestrator.js

class HeadOrchestrator {
  constructor({ logger, renameMap, manifestData, version, assets, htmlFile }) {
    this.logger = logger;
    this.renameMap = renameMap;
    this.manifestData = manifestData;
    this.version = version;
    this.assets = assets || {};
    this.htmlFile = htmlFile;
  }

  buildHead(html) {
    const headMatch = html.match(/(<head[^>]*>)([\s\S]*?)(<\/head>)/i);
    if (!headMatch) throw new Error('No <head> tag found');

    const [fullHead, openTag, innerContent, closeTag] = headMatch;

    const tags = [];

    // ================= BASE =================
    tags.push('<meta charset="UTF-8">');
    tags.push('<meta name="viewport" content="width=device-width, initial-scale=1">');
    tags.push('<meta name="theme-color" content="#000000">');

    // ================= TITLE =================
    const titleMatch = innerContent.match(/<title>[\s\S]*?<\/title>/i);
    const title = titleMatch ? titleMatch[0] : '<title>MotoSynteza</title>';
    tags.push(title);

    const cleanTitle = title.replace(/<\/?title>/gi, '').trim();

    // ================= DESCRIPTION =================
    const description =
      this.extractMeta(innerContent, 'description') ||
      'MotoSynteza – conceptual photography and visual storytelling.';

    tags.push(`<meta name="description" content="${description}">`);

    // ================= CANONICAL =================
    const canonical = this.buildCanonical();
    if (canonical) {
      tags.push(`<link rel="canonical" href="${canonical}">`);
    }

    // ================= OG =================
    tags.push(`<meta property="og:title" content="${cleanTitle}">`);
    tags.push(`<meta property="og:description" content="${description}">`);
    tags.push('<meta property="og:type" content="website">');

    if (canonical) {
      tags.push(`<meta property="og:url" content="${canonical}">`);
    }

    const ogImage = this.getOgImage();
    if (ogImage) {
      tags.push(`<meta property="og:image" content="${ogImage}">`);
    }

    // ================= TWITTER =================
    tags.push('<meta name="twitter:card" content="summary_large_image">');
    tags.push(`<meta name="twitter:title" content="${cleanTitle}">`);
    tags.push(`<meta name="twitter:description" content="${description}">`);

    if (ogImage) {
      tags.push(`<meta name="twitter:image" content="${ogImage}">`);
    }

    // ================= CSS =================
    const cssPath = this.getHashedCss();
    if (cssPath) {
      tags.push(`<link rel="stylesheet" href="${cssPath}">`);
      tags.push(`<link rel="preload" href="${cssPath}" as="style">`);
    }

    // ================= FAVICONS =================
    tags.push(...this.buildFavicons());

    // ================= PRELOAD LANDING IMAGE =================
    if (this.isLanding() || this.isMain()) {
      const preload = this.getLandingPreload();
      if (preload) tags.push(preload);
    }

    // ================= VERSION SCRIPT =================
    if (this.assets.versionScriptPath) {
      tags.push(`<script src="${this.assets.versionScriptPath}"></script>`);
    }

    // ================= OTHER SCRIPTS =================
    const scripts =
      innerContent.match(/<script[^>]*src=["'][^"']+["'][^>]*><\/script>/gi) || [];

    scripts
      .filter(s => !/build-version\./i.test(s))
      .forEach(s => tags.push(s));

    // ================= CSP =================
    if (this.assets.cspPolicy) {
      tags.push(
        `<meta http-equiv="Content-Security-Policy" content="${this.assets.cspPolicy}">`
      );
    }

    const newHead =
      openTag +
      '\n' +
      tags.map(t => `  ${t}`).join('\n') +
      '\n' +
      closeTag;

    return html.replace(fullHead, newHead);
  }

  // =========================================================

  extractMeta(content, name) {
    const match = content.match(
      new RegExp(
        `<meta[^>]*name=["']${name}["'][^>]*content=["']([^"']+)["'][^>]*>`,
        'i'
      )
    );
    return match ? match[1] : null;
  }

  buildCanonical() {
    const base = 'https://motimorphoza.github.io/MotoSynteza/';
    const fileName = this.htmlFile.split(/[\\/]/).pop();
    return base + fileName;
  }

  getHashedCss() {
    for (const [oldPath, newPath] of this.renameMap.entries()) {
      if (oldPath.startsWith('css/') && oldPath.endsWith('.css')) {
        return newPath;
      }
    }
    return null;
  }

  buildFavicons() {
    const tags = [];

    for (const [oldPath, newPath] of this.renameMap.entries()) {
      if (!oldPath.includes('favicon')) continue;

      if (oldPath.includes('32')) {
        tags.push(`<link rel="icon" type="image/png" sizes="32x32" href="${newPath}">`);
      }

      if (oldPath.includes('180')) {
        tags.push(`<link rel="apple-touch-icon" sizes="180x180" href="${newPath}">`);
      }

      if (oldPath.includes('512')) {
        tags.push(`<link rel="icon" type="image/png" sizes="512x512" href="${newPath}">`);
      }

      if (/favicon\.png$/i.test(oldPath)) {
        tags.push(`<link rel="icon" href="${newPath}">`);
      }
    }

    return tags;
  }

  // ================= OG IMAGE LOGIC =================

getOgImage() {
  const base = 'https://motimorphoza.github.io/MotoSynteza/';

  // ===== PROJECT PAGE =====
  if (this.isProject() && Array.isArray(this.manifestData?.projects)) {
    const fileName = this.htmlFile.split(/[\\/]/).pop();
    const projectKey = fileName
      .replace('project-', '')
      .replace('.html', '');

    const project = this.manifestData.projects.find(
      p => p.slug === projectKey
    );

    if (project && project.images && project.images.length) {
      const first = project.images[0];
      const resolved = this.renameMap.get(first) || first;
      return base + resolved;
    }
  }

  // ===== FALLBACK og-cover =====
  for (const [oldPath, newPath] of this.renameMap.entries()) {
    if (oldPath.includes('og-cover')) {
      return base + newPath;
    }
  }

  return null;
}


  getLandingPreload() {
    if (!this.manifestData?.landing?.length) return null;

    const first = this.manifestData.landing[0];
    const resolved = this.renameMap.get(first) || first;

    return `<link rel="preload" href="${resolved}" as="image">`;
  }

  isLanding() {
    return this.htmlFile.endsWith('index.html');
  }

  isMain() {
    return this.htmlFile.endsWith('main.html');
  }

  isProject() {
    return this.htmlFile.includes('project-');
  }
}

module.exports = HeadOrchestrator;
