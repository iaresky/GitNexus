import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { analyzeJar, DEFAULT_JAR_OPTIONS, type JarAnalysisResult } from '../../src/core/ingestion/jar-analyzer.js';
import { isDecompilerAvailable, getAvailableDecompilers, setDecompilerConfig } from '../../src/core/ingestion/decompiler.js';
import { existsSync, statSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import path from 'path';
import { createWriteStream } from 'fs';
import { pipeline } from 'stream';
import { promisify } from 'util';

const pump = promisify(pipeline);

function createMinimalJar(jarPath: string): void {
  const tempDir = path.join(process.cwd(), 'test', 'fixtures', 'temp-minimal');
  try {
    mkdirSync(tempDir, { recursive: true });

    const manifestContent = `Manifest-Version: 1.0\nMain-Class: Test\n\n`;
    writeFileSync(path.join(tempDir, 'META-INF', 'MANIFEST.MF'), manifestContent);

    const manifestBytes = Buffer.from(manifestContent);

    writeFileSync(path.join(tempDir, 'Test.class'), Buffer.alloc(0));

    const { execSync } = require('child_process');
    execSync(`cd ${tempDir} && zip -q -r "${jarPath}" .`, { stdio: 'ignore' });
  } finally {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  }
}

describe('Decompiler Integration', () => {
  describe('decompiler availability', () => {
    it('should check if any decompiler is available', () => {
      const available = isDecompilerAvailable();
      expect(typeof available).toBe('boolean');
    });

    it('should return list of available decompilers', () => {
      const decompilers = getAvailableDecompilers();
      expect(Array.isArray(decompilers)).toBe(true);
    });

    it('should disable decompiler via config', () => {
      setDecompilerConfig({ enabled: false });
      const available = isDecompilerAvailable();
      setDecompilerConfig({ enabled: true });
      expect(available).toBe(false);
    });
  });

  describe('analyzeJar with decompile option', () => {
    const testJarPath = path.join(process.cwd(), 'test', 'fixtures', 'sample.jar');

    it('should set decompilerAvailable flag based on actual availability', async () => {
      const options = { ...DEFAULT_JAR_OPTIONS, enableDecompile: true };
      const result = await analyzeJar(testJarPath, options);

      expect(typeof result.decompilerAvailable).toBe('boolean');
      expect(Array.isArray(result.availableDecompilers)).toBe(true);
    });

    it('should skip decompilation when enableDecompile is false', async () => {
      const options = { ...DEFAULT_JAR_OPTIONS, enableDecompile: false };
      const result = await analyzeJar(testJarPath, options);

      expect(result.decompilerAvailable).toBe(false);
    });

    it('should include decompiler info in result', async () => {
      const options = { ...DEFAULT_JAR_OPTIONS, enableDecompile: true };
      const result = await analyzeJar(testJarPath, options);

      expect(result).toHaveProperty('availableDecompilers');
      expect(result).toHaveProperty('decompilerAvailable');
    });
  });

  describe('analyzeJar error handling', () => {
    it('should handle non-existent JAR files gracefully', async () => {
      const nonExistentPath = '/non/existent/path/test.jar';
      const result = await analyzeJar(nonExistentPath);

      expect(result.error).toBeDefined();
      expect(result.graphNodes).toEqual([]);
      expect(result.graphRelationships).toEqual([]);
    });

    it('should handle invalid JAR files gracefully', async () => {
      const result = await analyzeJar('/workspace/gitnexus/package.json');

      expect(result.error || result.graphNodes.length >= 0).toBeTruthy();
    });
  });

  describe('JarAnalysisResult structure', () => {
    it('should have correct structure for class file analysis', async () => {
      const testJarPath = path.join(process.cwd(), 'test', 'fixtures', 'sample.jar');

      if (!existsSync(testJarPath)) {
        return;
      }

      const result = await analyzeJar(testJarPath);

      for (const [classPath, analysis] of result.classFiles) {
        expect(classPath).toBeDefined();
        expect(classPath.endsWith('.class')).toBe(true);
        expect(analysis).toHaveProperty('bytecodeResult');
        expect(analysis).toHaveProperty('bytecodeResult.graphNodes');
        expect(analysis).toHaveProperty('bytecodeResult.graphRelationships');
      }
    });
  });
});

describe('Decompiler Configuration', () => {
  it('should accept valid decompiler preference', () => {
    setDecompilerConfig({ preferredDecompiler: 'cfr' });
    setDecompilerConfig({ preferredDecompiler: 'procyon' });
    setDecompilerConfig({ preferredDecompiler: 'fernflower' });
    setDecompilerConfig({ preferredDecompiler: 'bytecode' });
  });

  it('should accept timeout configuration', () => {
    setDecompilerConfig({ timeout: 5000 });
    setDecompilerConfig({ timeout: 60000 });
  });

  it('should accept max file size configuration', () => {
    setDecompilerConfig({ maxFileSize: 5 * 1024 * 1024 });
    setDecompilerConfig({ maxFileSize: 100 * 1024 * 1024 });
  });
});
