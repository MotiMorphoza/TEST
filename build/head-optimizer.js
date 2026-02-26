// build/head-optimizer.js
// STUB: Functionality moved to HeadOrchestrator
// Kept for import compatibility

class HeadOptimizer {
  constructor(logger) {
    this.logger = logger;
  }

  optimizeAll(htmlFiles, buildDir, manifest) {
    // No-op: handled by HeadOrchestrator
    this.logger.debug('HeadOptimizer is deprecated - using HeadOrchestrator');
  }
}

module.exports = HeadOptimizer;
