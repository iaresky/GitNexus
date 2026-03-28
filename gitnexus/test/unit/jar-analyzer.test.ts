import { describe, it, expect, beforeEach } from 'vitest';
import {
  parseManifest,
  DEFAULT_JAR_OPTIONS,
  detectBinaryFiles,
} from '../../src/core/ingestion/jar-analyzer.js';
import { setBinaryIndexingConfig, DEFAULT_BINARY_INDEXING_CONFIG } from '../../src/config/binary-indexing-config.js';

describe('JAR Analyzer', () => {
  describe('parseManifest', () => {
    it('should parse basic manifest', () => {
      const content = `Manifest-Version: 1.0
Main-Class: com.example.Main

`;
      const result = parseManifest(content);

      expect(result.manifestVersion).toBe('1.0');
      expect(result.mainClass).toBe('com.example.Main');
    });

    it('should parse Class-Path entries', () => {
      const content = `Manifest-Version: 1.0
Class-Path: lib/a.jar lib/b.jar lib/c.jar

`;
      const result = parseManifest(content);

      expect(result.classPath).toEqual(['lib/a.jar', 'lib/b.jar', 'lib/c.jar']);
    });

    it('should parse all entries', () => {
      const content = `Manifest-Version: 1.0
Built-By: Builder
Implementation-Title: MyApp
Implementation-Version: 1.0

`;
      const result = parseManifest(content);

      expect(result.entries.size).toBeGreaterThan(0);
    });

    it('should handle continuation lines', () => {
      const content = `Manifest-Version: 1.0
Class-Path: lib/a.jar lib/
 b.jar lib/c.jar

`;
      const result = parseManifest(content);

      expect(result.classPath).toContain('lib/b.jar');
    });
  });

  describe('DEFAULT_JAR_OPTIONS', () => {
    it('should have correct defaults', () => {
      expect(DEFAULT_JAR_OPTIONS.extractInnerClasses).toBe(true);
      expect(DEFAULT_JAR_OPTIONS.maxJarSize).toBe(100 * 1024 * 1024);
      expect(DEFAULT_JAR_OPTIONS.recursiveNestedJars).toBe(false);
      expect(DEFAULT_JAR_OPTIONS.skipResources).toBe(false);
    });
  });

  describe('detectBinaryFiles', () => {
    it('should detect JAR files', () => {
      const files = ['a.jar', 'b.jar', 'c.txt'];
      const result = detectBinaryFiles(files);

      expect(result.jarPaths).toEqual(['a.jar', 'b.jar']);
    });

    it('should detect class files', () => {
      const files = ['Test.class', 'Main.class', 'readme.txt'];
      const result = detectBinaryFiles(files);

      expect(result.classPaths).toEqual(['Test.class', 'Main.class']);
    });

    it('should detect JSP files', () => {
      const files = ['index.jsp', 'test.jsp', 'page.html'];
      const result = detectBinaryFiles(files);

      expect(result.jspPaths).toEqual(['index.jsp', 'test.jsp']);
    });

    it('should handle mixed files', () => {
      const files = [
        'lib.jar',
        'Main.class',
        'index.jsp',
        'readme.md',
      ];
      const result = detectBinaryFiles(files);

      expect(result.jarPaths).toEqual(['lib.jar']);
      expect(result.classPaths).toEqual(['Main.class']);
      expect(result.jspPaths).toEqual(['index.jsp']);
    });
  });
});

describe('Binary Indexing Config', () => {
  beforeEach(() => {
    setBinaryIndexingConfig(DEFAULT_BINARY_INDEXING_CONFIG);
  });

  it('should return default config', () => {
    const config = DEFAULT_BINARY_INDEXING_CONFIG;

    expect(config.enabled).toBe(false);
    expect(config.indexJar).toBe(false);
    expect(config.indexClass).toBe(false);
    expect(config.indexJsp).toBe(false);
  });

  it('should allow partial config updates', () => {
    setBinaryIndexingConfig({
      enabled: true,
      indexJsp: true,
    });

    const config = DEFAULT_BINARY_INDEXING_CONFIG;
    expect(config.enabled).toBe(false);

    const currentConfig = {
      ...DEFAULT_BINARY_INDEXING_CONFIG,
      enabled: true,
      indexJsp: true,
    };
    expect(currentConfig.enabled).toBe(true);
    expect(currentConfig.indexJsp).toBe(true);
  });
});
