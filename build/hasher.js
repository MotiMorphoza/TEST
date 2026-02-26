// build/hasher.js
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class Hasher {
  constructor(logger) {
    this.logger = logger;
    this.renameMap = new Map();
    this.usedHashes = new Set();
  }

  /**
   * Generate SHA-256 hash from file content (first 8 chars)
   */
  hashFile(filePath) {
    const content = fs.readFileSync(filePath);
    return crypto.createHash('sha256').update(content).digest('hex').substring(0, 8);
  }

  /**
   * Strip existing hash from filename
   */
  stripHash(filename) {
    // Match pattern: name.[8hex].ext
    return filename.replace(/\.[a-f0-9]{8}(\.[^.]+)$/, '$1');
  }

  /**
   * Generate unique hash (handle collisions)
   */
  generateUniqueHash(content, originalHash) {
    let hash = originalHash;
    let counter = 2;

    while (this.usedHashes.has(hash)) {
      // Collision detected, append counter
      const counterStr = counter.toString().padStart(2, '0');
      hash = `${originalHash.substring(0, 6)}${counterStr}`;
      counter++;
      
      if (counter > 99) {
        // Safety: use full hash if too many collisions
        hash = crypto.createHash('sha256').update(content + counter.toString()).digest('hex').substring(0, 8);
      }
    }

    this.usedHashes.add(hash);
    return hash;
  }

  /**
   * Hash a single file and rename it
   */
  hashAndRename(filePath, buildDir) {
    const relativePath = path.relative(buildDir, filePath);
    const dir = path.dirname(filePath);
    const ext = path.extname(filePath);
    const basename = path.basename(filePath, ext);
    
    // Strip any existing hash
    const cleanBasename = this.stripHash(basename + ext).replace(ext, '');
    
    // Generate hash
    const content = fs.readFileSync(filePath);
    const rawHash = this.hashFile(filePath);
    const hash = this.generateUniqueHash(content, rawHash);
    
    // New filename
    const hashedName = `${cleanBasename}.${hash}${ext}`;
    const newPath = path.join(dir, hashedName);
    
    // Rename
    fs.renameSync(filePath, newPath);
    
    // Store mapping (use forward slashes for consistency)
    const oldRelative = relativePath.replace(/\\/g, '/');
    const newRelative = path.relative(buildDir, newPath).replace(/\\/g, '/');
    
    this.renameMap.set(oldRelative, newRelative);
    
    this.logger.debug(`Hashed: ${oldRelative} -> ${newRelative}`);
    
    return newRelative;
  }

  /**
   * Hash all CSS and JS files in build directory
   */
  hashAssets(buildDir, scanner) {
  const cssFiles = scanner.scanDirectory(
    path.join(buildDir, 'css'),
    ['.css'],
    [],
    buildDir
  );

  const jsFiles = scanner.scanDirectory(
    path.join(buildDir, 'js'),
    ['.js'],
    [],
    buildDir
  );

const imageFiles = scanner.scanDirectory(
  path.join(buildDir, 'images'),
  ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg'],
  [],
  buildDir
);


  const allFiles = [];

  for (const f of [...cssFiles, ...jsFiles, ...imageFiles]) {
    const fullPath = path.join(buildDir, f);
    allFiles.push(fullPath);
  }

  for (const file of allFiles) {
    this.hashAndRename(file, buildDir);
  }

  this.logger.updateStats('hashedFiles', allFiles.length);
}


  /**
   * Get rename mapping
   */
  getRenameMap() {
    return this.renameMap;
  }
}

module.exports = Hasher;
