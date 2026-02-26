// build.js
const fs = require('fs');
const path = require('path');

const Logger = require('./build/logger');
const Scanner = require('./build/scanner');
const Hasher = require('./build/hasher');
const HtmlProcessor = require('./build/html-processor');
const ManifestGenerator = require('./build/manifest-generator');
const HeadOrchestrator = require('./build/head-orchestrator');
const Versioning = require('./build/versioning');
const AtomicDeployer = require('./build/atomic-deployer');

class SuperBuild {
  constructor() {
    this.logger = new Logger();
    this.scanner = new Scanner(this.logger);
    this.hasher = new Hasher(this.logger);
    this.htmlProcessor = new HtmlProcessor(this.logger);
    this.manifestGenerator = new ManifestGenerator(this.logger);
    this.versioning = new Versioning(this.logger);
    this.deployer = new AtomicDeployer(this.logger);
    this.rootDir = process.cwd();
  }

  build() {
    try {
      this.logger.info('Starting build process');

      this.validateSource();
      this.validateProjects(this.rootDir);

      const tempDir = this.deployer.initTempDir(this.rootDir);
      this.deployer.copyToTemp(this.rootDir, tempDir);
      const buildProjects = this.validateProjects(tempDir);
      this.generateProjectsManifest(buildProjects, tempDir);

      // ---------- Manifest ----------
      const manifestData = this.manifestGenerator.createManifestData(
        this.scanner,
        path.join(tempDir, 'images'),
        tempDir
      );

      const manifestPath = path.join(tempDir, 'js', 'image-manifest.js');
      this.manifestGenerator.generate(manifestData, manifestPath);
      const manifestContent = fs.readFileSync(manifestPath, 'utf8');

      // ---------- Preliminary version ----------
      const prelimVersion = this.versioning.generateVersion(new Map(), manifestContent);
      this.versioning.createVersionFile(tempDir, prelimVersion);

      // ---------- Hash assets ----------
      this.hasher.hashAssets(tempDir, this.scanner);
      const renameMap = this.hasher.getRenameMap();

      // ---------- Final version ----------
      const finalVersion = this.versioning.generateVersion(renameMap, manifestContent);

      const jsDir = path.join(tempDir, 'js');
      const jsFiles = fs.readdirSync(jsDir).sort();

      const hashedVersionFile = jsFiles.find(f =>
        /^build-version\.[a-f0-9]{8}\.js$/.test(f)
      );

      if (hashedVersionFile) {
        fs.writeFileSync(
          path.join(jsDir, hashedVersionFile),
          `window.__BUILD_VERSION__ = "${finalVersion}";\n`,
          'utf8'
        );
      }

      // ---------- Rewrite ALL HTML ----------
      const htmlFiles = this.scanner.findHtmlFiles(tempDir);
      this.htmlProcessor.processHtmlFiles(htmlFiles, tempDir, renameMap);

      // ---------- Rewrite partials ----------
      const partialsDir = path.join(tempDir, 'partials');
      if (fs.existsSync(partialsDir)) {
        const partialFiles = fs.readdirSync(partialsDir)
          .filter(f => f.endsWith('.html'));

        for (const partialFile of partialFiles) {
          const filePath = path.join(partialsDir, partialFile);
          this.htmlProcessor.processFragment(filePath, renameMap, tempDir);
        }
      }

      // ---------- Rewrite CSS url() ----------
      const cssDir = path.join(tempDir, 'css');
      if (fs.existsSync(cssDir)) {
        const cssFiles = fs.readdirSync(cssDir)
          .filter(f => f.endsWith('.css'));

        for (const cssFile of cssFiles) {
          const cssPath = path.join(cssDir, cssFile);
          let cssContent = fs.readFileSync(cssPath, 'utf8');

          for (const [oldPath, newPath] of renameMap.entries()) {
            const escaped = oldPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(escaped, 'g');
            cssContent = cssContent.replace(regex, newPath);
          }

          fs.writeFileSync(cssPath, cssContent, 'utf8');
        }
      }

      // ---------- Rewrite manifest ----------
      const jsFilesAfterHash = fs.readdirSync(jsDir);
      const manifestFile = jsFilesAfterHash.find(f =>
        /^image-manifest\.[a-f0-9]{8}\.js$/.test(f)
      );

      if (!manifestFile) {
        throw new Error('Hashed manifest file not found');
      }

      const manifestFullPath = path.join(jsDir, manifestFile);
      let manifestJs = fs.readFileSync(manifestFullPath, 'utf8');

      for (const [oldPath, newPath] of renameMap.entries()) {
        const escaped = oldPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(escaped, 'g');
        manifestJs = manifestJs.replace(regex, newPath);
      }

      fs.writeFileSync(manifestFullPath, manifestJs, 'utf8');

      // ---------- HEAD orchestration ----------
      const assets = {
        versionScriptPath: hashedVersionFile
          ? `js/${hashedVersionFile}`
          : null,
        renameMap,
        version: finalVersion,
        cspPolicy:
          "default-src 'self'; img-src 'self' https: data:; script-src 'self'; style-src 'self'; font-src 'self' https:; object-src 'none'; base-uri 'self'; form-action 'self'"
      };

for (const htmlFile of htmlFiles) {
  const filePath = path.join(tempDir, htmlFile);
  let html = fs.readFileSync(filePath, 'utf8');

  const headOrchestrator = new HeadOrchestrator({
    logger: this.logger,
    renameMap,
    manifestData,
    version: finalVersion,
    assets,
    htmlFile
  });


        html = headOrchestrator.buildHead(html);
        fs.writeFileSync(filePath, html, 'utf8');
      }

      // ---------- Verify ----------
      this.htmlProcessor.verifyReferences(htmlFiles, tempDir);

      if (fs.existsSync(partialsDir)) {
        const partialFiles = fs.readdirSync(partialsDir)
          .filter(f => f.endsWith('.html'))
          .map(f => path.join('partials', f));

        this.htmlProcessor.verifyReferences(partialFiles, tempDir);
      }

      // ---------- Deploy ----------
      this.deployer.deploy(this.rootDir);
      this.logger.printSummary(path.join(this.rootDir, 'docs'));

    } catch (error) {
      this.logger.error(`Build failed: ${error.message}`);
      this.deployer.cleanup(this.rootDir);
      process.exit(1);
    }
  }

  generateProjectsManifest(projects, tempDir) {
  const outputPath = path.join(tempDir, 'js', 'projects-manifest.js');

  const payload = projects.map(project => ({
    slug: project.slug,
    title: project.title,
    description: project.description || '',
    cover: project.images[0]?.src || '',
    imageCount: project.images.length
  }));

  const content = `window.__PROJECTS__ = ${JSON.stringify(payload, null, 2)};\n`;

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, content, 'utf8');

  this.logger.info('Generated projects manifest: js/projects-manifest.js');
}
  validateProjects(rootDir) {
    const projects = this.scanner.scanProjectsFromRoot(rootDir);
    this.logger.info(`Validated ${projects.length} projects from folder slugs`);
    return projects;
  }

  validateSource() {
    const required = ['index.html', 'css', 'js', 'images'];

    for (const item of required) {
      if (!fs.existsSync(path.join(this.rootDir, item))) {
        throw new Error(`Missing required directory: ${item}`);
      }
    }

    this.logger.info('Source structure validated');
  }
}

if (require.main === module) {
  new SuperBuild().build();
}

module.exports = SuperBuild;
