// build/html-processor.js
const fs = require('fs');
const path = require('path');

class HtmlProcessor {
  constructor(logger) {
    this.logger = logger;
  }

  // ================================
  // FULL HTML FILES (require <head>)
  // ================================
  processHtmlFiles(htmlFiles, buildDir, renameMap) {
    for (const htmlFile of htmlFiles) {
      const filePath = path.join(buildDir, htmlFile);
      this.processFile(filePath, renameMap, buildDir);
    }

    this.logger.updateStats('htmlFiles', htmlFiles.length);
  }

  processFile(filePath, renameMap, buildDir) {
    let content = fs.readFileSync(filePath, 'utf8');

    if (!/<head[^>]*>/i.test(content)) {
      throw new Error(
        `HTML file missing <head>: ${path.relative(buildDir, filePath)}`
      );
    }

    content = this.updateAssetReferences(
      content,
      renameMap,
      filePath,
      buildDir
    );

    fs.writeFileSync(filePath, content, 'utf8');
  }

  // ================================
  // FRAGMENTS / PARTIALS (no <head>)
  // ================================
  processFragment(filePath, renameMap, buildDir) {
    let content = fs.readFileSync(filePath, 'utf8');

    content = this.updateAssetReferences(
      content,
      renameMap,
      filePath,
      buildDir
    );

    fs.writeFileSync(filePath, content, 'utf8');
  }

  // ================================
  // UPDATE REFERENCES
  // ================================
  updateAssetReferences(html, renameMap, htmlFilePath, buildDir) {
    html = this.updateStylesheets(html, renameMap, htmlFilePath, buildDir);
    html = this.updateScripts(html, renameMap, htmlFilePath, buildDir);
    html = this.updateImages(html, renameMap, htmlFilePath, buildDir);
    html = this.updateInlineStyles(html, renameMap, htmlFilePath, buildDir);
    html = this.updateMetaContent(html, renameMap, htmlFilePath, buildDir);

    return html;
  }

  updateStylesheets(html, renameMap, htmlFilePath, buildDir) {
    const regex = /<link\s+([^>]*?)href=["']([^"']+)["']([^>]*?)>/gi;

    return html.replace(regex, (match, before, href, after) => {
      if (!/rel\s*=\s*["']stylesheet["']/i.test(match)) return match;
      if (this.isExternal(href)) return match;

      const newHref = this.resolveNewPath(
        href,
        renameMap,
        htmlFilePath,
        buildDir
      );

      return newHref !== href
        ? `<link ${before}href="${newHref}"${after}>`
        : match;
    });
  }

  updateScripts(html, renameMap, htmlFilePath, buildDir) {
    const regex = /<script\s+([^>]*?)src=["']([^"']+)["']([^>]*?)>/gi;

    return html.replace(regex, (match, before, src, after) => {
      if (this.isExternal(src)) return match;

      const newSrc = this.resolveNewPath(
        src,
        renameMap,
        htmlFilePath,
        buildDir
      );

      return newSrc !== src
        ? `<script ${before}src="${newSrc}"${after}>`
        : match;
    });
  }

  updateImages(html, renameMap, htmlFilePath, buildDir) {
    const regex = /<img\s+([^>]*?)src=["']([^"']+)["']([^>]*?)>/gi;

    return html.replace(regex, (match, before, src, after) => {
      if (this.isExternal(src)) return match;

      const newSrc = this.resolveNewPath(
        src,
        renameMap,
        htmlFilePath,
        buildDir
      );

      return newSrc !== src
        ? `<img ${before}src="${newSrc}"${after}>`
        : match;
    });
  }

  updateInlineStyles(html, renameMap, htmlFilePath, buildDir) {
    const regex = /url\(["']?([^"')]+)["']?\)/gi;

    return html.replace(regex, (match, assetPath) => {
      if (this.isExternal(assetPath)) return match;

      const newPath = this.resolveNewPath(
        assetPath,
        renameMap,
        htmlFilePath,
        buildDir
      );

      return newPath !== assetPath
        ? `url("${newPath}")`
        : match;
    });
  }

  updateMetaContent(html, renameMap, htmlFilePath, buildDir) {
    const regex = /(content|href)=["']([^"']+)["']/gi;

    return html.replace(regex, (match, attr, value) => {
      if (this.isExternal(value)) return match;

      const newValue = this.resolveNewPath(
        value,
        renameMap,
        htmlFilePath,
        buildDir
      );

      return newValue !== value
        ? `${attr}="${newValue}"`
        : match;
    });
  }

  // ================================
  // VERIFY
  // ================================
  verifyReferences(htmlFiles, buildDir) {
    for (const htmlFile of htmlFiles) {
      const filePath = path.join(buildDir, htmlFile);
      const content = fs.readFileSync(filePath, 'utf8');

      this.verifyAssets(content, filePath, buildDir);
    }
  }

  verifyAssets(html, htmlFilePath, buildDir) {
    const regex = /(src|href)=["']([^"']+)["']/gi;
    let match;

    while ((match = regex.exec(html)) !== null) {
      const value = match[2];
      if (this.isExternal(value)) continue;

      this.checkFileExists(value, htmlFilePath, buildDir);
    }
  }

  checkFileExists(href, htmlFilePath, buildDir) {
  let filePath;

  if (href.startsWith('/')) {
    filePath = path.join(buildDir, href.substring(1));
  } else {
    const htmlDir = path.dirname(htmlFilePath);
    filePath = path.resolve(htmlDir, href);
  }

  // If not found, try resolving from build root (for partials)
  if (!fs.existsSync(filePath)) {
    const rootAttempt = path.join(buildDir, href);
    if (fs.existsSync(rootAttempt)) {
      return;
    }

    throw new Error(
      `Missing file: ${href} (from ${path.relative(
        buildDir,
        htmlFilePath
      )})`
    );
  }
}

  // ================================
  // HELPERS
  // ================================
  isExternal(url) {
  if (!url) return true;

  return (
    url.startsWith('#') ||             // anchors
    url.startsWith('javascript:') ||   // inline JS
    url.startsWith('http://') ||
    url.startsWith('https://') ||
    url.startsWith('//') ||
    url.startsWith('mailto:') ||
    url.startsWith('data:')
  );
}

  resolveNewPath(href, renameMap, htmlFilePath, buildDir) {
  if (!href) return href;

  // Normalize
  const cleanHref = href.replace(/\\/g, '/');

  // Direct match (most important for images/media in partials)
  if (renameMap.has(cleanHref)) {
    return renameMap.get(cleanHref);
  }

  // Relative to file
  const htmlDir = path.dirname(htmlFilePath);
  const absolutePath = path.resolve(htmlDir, cleanHref);
  const relativeFromBuild = path
    .relative(buildDir, absolutePath)
    .replace(/\\/g, '/');

  if (renameMap.has(relativeFromBuild)) {
    return renameMap.get(relativeFromBuild);
  }

  return href;
}
}
module.exports = HtmlProcessor;
