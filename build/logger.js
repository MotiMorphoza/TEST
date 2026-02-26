// build/logger.js
const fs = require('fs');
const path = require('path');

class Logger {
  constructor() {
    this.prefix = '[Super Build v5]';
    this.startTime = Date.now();
    this.stats = {
      hashedFiles: 0,
      htmlFiles: 0,
      totalSize: 0
    };
  }

  log(level, message) {
    const timestamp = new Date().toISOString();
    console.log(`${this.prefix}[${level}] ${message}`);
  }

  info(message) {
    this.log('INFO', message);
  }

  success(message) {
    this.log('INFO', message);
  }

  warn(message) {
    this.log('WARN', message);
  }

  error(message) {
    this.log('ERROR', message);
  }

  debug(message) {
    if (process.env.DEBUG) {
      this.log('DEBUG', message);
    }
  }

  updateStats(key, value) {
    this.stats[key] = value;
  }

  incrementStat(key) {
    this.stats[key]++;
  }

  calculateTotalSize(dir) {
    let total = 0;
    
    if (!fs.existsSync(dir)) {
      return total;
    }

    const files = fs.readdirSync(dir, { withFileTypes: true });
    
    for (const file of files) {
      const fullPath = path.join(dir, file.name);
      if (file.isDirectory()) {
        total += this.calculateTotalSize(fullPath);
      } else {
        total += fs.statSync(fullPath).size;
      }
    }
    
    return total;
  }

  printSummary(docsPath) {
    const elapsed = Date.now() - this.startTime;
    const totalSize = this.calculateTotalSize(docsPath);
    
    this.success('Build completed successfully');
    this.info(`Hashed files: ${this.stats.hashedFiles}`);
    this.info(`HTML files processed: ${this.stats.htmlFiles}`);
    this.info(`Total build size: ${totalSize} bytes`);
    this.info(`Build time: ${elapsed} ms`);
  }

  fatal(message) {
    this.error('Build failed');
    this.error(message);
    process.exit(1);
  }
}

module.exports = Logger;
