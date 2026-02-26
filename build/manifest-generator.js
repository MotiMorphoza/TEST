// build/manifest-generator.js
const fs = require('fs');
const path = require('path');

class ManifestGenerator {
  constructor(logger) {
    this.logger = logger;
  }

  /**
   * Generate image-manifest.js file
   */
  generate(manifestData, outputPath) {
    const content = this.buildManifestContent(manifestData);
    
    // Ensure directory exists
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    fs.writeFileSync(outputPath, content, 'utf8');
    this.logger.info(`Generated manifest: ${path.relative(process.cwd(), outputPath)}`);
    
    return outputPath;
  }

  buildManifestContent(data) {
    // Deterministic JSON serialization
    const json = JSON.stringify(data, null, 2);
    
    return `window.__MANIFEST__ = ${json};\n`;
  }

  /**
   * Create manifest data structure
   */
   createManifestData(scanner, imagesDir, rootDir) {
    return scanner.scanImagesForManifest(imagesDir, rootDir);

  }
}

module.exports = ManifestGenerator;
