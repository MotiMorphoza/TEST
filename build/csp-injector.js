// build/csp-injector.js
// STUB: Functionality moved to HeadOrchestrator
// Kept for import compatibility

class CspInjector {
  constructor(logger) {
    this.logger = logger;
  }

  injectCsp(htmlFiles, buildDir) {
    // No-op: handled by HeadOrchestrator
    this.logger.debug('CspInjector is deprecated - using HeadOrchestrator');
  }
}

module.exports = CspInjector;
