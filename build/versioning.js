// build/versioning.js
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * Versioning - Build version generation only
 * (Head injection moved to HeadOrchestrator)
 */
class Versioning {
  constructor(logger) {
    this.logger = logger;
  }

  /**
   * Generate deterministic build version
   */
  generateVersion(renameMap, manifestContent) {
    const data = {
      renames: Array.from(renameMap.entries()).sort(),
      manifest: manifestContent
    };

    const hash = crypto
      .createHash('sha256')
      .update(JSON.stringify(data))
      .digest('hex')
      .substring(0, 12);

    return hash;
  }

  /**
   * Create external version file (js/build-version.js)
   */
  createVersionFile(buildDir, version) {
    const versionContent = `window.__BUILD_VERSION__ = "${version}";\n`;
    const versionPath = path.join(buildDir, 'js', 'build-version.js');
    
    // Ensure js directory exists
    const jsDir = path.dirname(versionPath);
    if (!fs.existsSync(jsDir)) {
      fs.mkdirSync(jsDir, { recursive: true });
    }
    
    fs.writeFileSync(versionPath, versionContent, 'utf8');
    this.logger.info('Generated build version file');
    
    return versionPath;
  }
}

module.exports = Versioning;
