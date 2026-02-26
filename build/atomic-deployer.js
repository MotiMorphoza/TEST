// build/atomic-deployer.js
const fs = require('fs');
const path = require('path');
const Scanner = require('./scanner');

class AtomicDeployer {
  constructor(logger) {
    this.logger = logger;
    this.tempDir = '.build-temp';
    this.backupDir = '.docs-backup';
    this.targetDir = 'docs';
    this.directoriesToCopy = ['css', 'js', 'images', 'partials'];
  }

  // --------------------------------------------------
  // Initialize fresh temp directory
  // --------------------------------------------------
  initTempDir(rootDir) {
    const tempPath = path.join(rootDir, this.tempDir);

    if (fs.existsSync(tempPath)) {
      fs.rmSync(tempPath, { recursive: true, force: true });
    }

    fs.mkdirSync(tempPath, { recursive: true });
    this.logger.info('Temp build directory ready');

    return tempPath;
  }

  // --------------------------------------------------
  // Copy project source into temp directory
  // --------------------------------------------------
  copyToTemp(rootDir, tempDir) {
    this.logger.info('Copying source into temp directory');

    const scanner = new Scanner(this.logger);
    const htmlFiles = scanner.findHtmlFiles(rootDir);

    // Copy HTML files
    for (const file of htmlFiles) {
      const src = path.join(rootDir, file);
      const dest = path.join(tempDir, file);

      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(src, dest);
    }

    // Copy static directories

    const srcProjectsDir = path.join(rootDir, 'src', 'projects');
    const legacyProjectsDir = path.join(rootDir, 'projects');
    const projectsDest = path.join(tempDir, 'projects');

    if (fs.existsSync(srcProjectsDir) && fs.statSync(srcProjectsDir).isDirectory()) {
      fs.cpSync(srcProjectsDir, projectsDest, { recursive: true });
    } else if (fs.existsSync(legacyProjectsDir) && fs.statSync(legacyProjectsDir).isDirectory()) {
      fs.cpSync(legacyProjectsDir, projectsDest, { recursive: true });
    }
    for (const dir of this.directoriesToCopy) {
      const src = path.join(rootDir, dir);
      const dest = path.join(tempDir, dir);

      if (fs.existsSync(src) && fs.statSync(src).isDirectory()) {
        fs.cpSync(src, dest, { recursive: true });
      }
    }
  }

  // --------------------------------------------------
  // Atomic deploy with safe swap + rollback
  // --------------------------------------------------
  deploy(rootDir) {
    const tempPath = path.join(rootDir, this.tempDir);
    const targetPath = path.join(rootDir, this.targetDir);
    const backupPath = path.join(rootDir, this.backupDir);

    try {
      // Remove stale backup
      if (fs.existsSync(backupPath)) {
        fs.rmSync(backupPath, { recursive: true, force: true });
      }

      // If docs exists → move it to backup (atomic rename)
      if (fs.existsSync(targetPath)) {
        this.logger.info('Creating backup of current docs');
        fs.renameSync(targetPath, backupPath);
      }

      // Promote temp → docs (atomic rename)
      this.logger.info('Promoting build to docs');
      fs.renameSync(tempPath, targetPath);

      // If everything succeeded → remove backup
      if (fs.existsSync(backupPath)) {
        fs.rmSync(backupPath, { recursive: true, force: true });
      }

      this.logger.success('Deployment completed successfully');

    } catch (error) {
      this.logger.error(`Deployment failed: ${error.message}`);

      // Rollback if backup exists
      if (fs.existsSync(backupPath)) {
        this.logger.info('Restoring previous version');

        if (fs.existsSync(targetPath)) {
          fs.rmSync(targetPath, { recursive: true, force: true });
        }

        fs.renameSync(backupPath, targetPath);
        this.logger.info('Rollback completed');
      }

      // Clean temp if still exists
      if (fs.existsSync(tempPath)) {
        fs.rmSync(tempPath, { recursive: true, force: true });
      }

      throw error;
    }
  }

  // --------------------------------------------------
  // Cleanup temp directory manually
  // --------------------------------------------------
  cleanup(rootDir) {
    const tempPath = path.join(rootDir, this.tempDir);

    if (fs.existsSync(tempPath)) {
      fs.rmSync(tempPath, { recursive: true, force: true });
      this.logger.info('Temp directory cleaned');
    }
  }
}

module.exports = AtomicDeployer;
