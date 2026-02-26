// build/preload-injector.js
// STUB: Functionality moved to HeadOrchestrator
// Kept for import compatibility

class PreloadInjector {
  constructor(logger) {
    this.logger = logger;
  }

  injectPreloads(htmlFiles, buildDir, renameMap, manifest, scanner) {
    // No-op: handled by HeadOrchestrator
    this.logger.debug('PreloadInjector is deprecated - using HeadOrchestrator');
  }
}

module.exports = PreloadInjector;
