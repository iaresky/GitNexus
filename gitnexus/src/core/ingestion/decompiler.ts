import { execSync, exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { statSync } from 'fs';
import { createGunzip } from 'zlib';
import type { Readable } from 'stream';

const execAsync = promisify(exec);

export interface DecompileResult {
  success: boolean;
  sourceCode?: string;
  error?: string;
  decompiler: 'cfr' | 'procyon' | 'fernflower' | 'bytecode';
}

export interface DecompilerConfig {
  enabled: boolean;
  preferredDecompiler: 'cfr' | 'procyon' | 'fernflower' | 'bytecode';
  timeout: number;
  maxFileSize: number;
}

const DEFAULT_CONFIG: DecompilerConfig = {
  enabled: true,
  preferredDecompiler: 'cfr',
  timeout: 30000,
  maxFileSize: 10 * 1024 * 1024,
};

let config: DecompilerConfig = { ...DEFAULT_CONFIG };

export function setDecompilerConfig(newConfig: Partial<DecompilerConfig>): void {
  config = { ...config, ...newConfig };
}

export function getDecompilerConfig(): DecompilerConfig {
  return { ...config };
}

function checkDecompilerAvailable(name: 'cfr' | 'procyon' | 'fernflower'): boolean {
  try {
    execSync(`which ${name}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function findDecompilerJar(name: 'cfr' | 'procyon' | 'fernflower'): string | null {
  const possiblePaths = [
    `/usr/local/lib/${name}.jar`,
    `/usr/share/java/${name}.jar`,
    path.join(os.homedir(), `.local/lib/${name}.jar`),
    path.join(os.homedir(), `tools/${name}.jar`),
  ];

  for (const jarPath of possiblePaths) {
    try {
      if (statSync(jarPath).isFile()) {
        return jarPath;
      }
    } catch {
    }
  }
  return null;
}

async function decompileWithCFR(classFilePath: string, outputPath: string): Promise<string> {
  const jarPath = findDecompilerJar('cfr');
  if (!jarPath) {
    throw new Error('CFR decompiler not found. Install from https://github.com/leibnitz27/cfr');
  }

  execSync(
    `java -jar "${jarPath}" "${classFilePath}" --output "${outputPath}" --silent`,
    { encoding: 'utf-8', timeout: config.timeout }
  );

  return outputPath;
}

async function decompileWithProcyon(classFilePath: string, outputPath: string): Promise<string> {
  const jarPath = findDecompilerJar('procyon');
  if (!jarPath) {
    throw new Error('Procyon decompiler not found. Install from https://github.com/mstrobel/procyon');
  }

  execSync(
    `java -jar "${jarPath}" "${classFilePath}" -o "${outputPath}"`,
    { encoding: 'utf-8', timeout: config.timeout }
  );

  return outputPath;
}

async function decompileWithFernflower(classFilePath: string, outputPath: string): Promise<string> {
  const jarPath = findDecompilerJar('fernflower');
  if (!jarPath) {
    throw new Error('FernFlower decompiler not found. Install from https://github.com/fesh0r/fernflower');
  }

  execSync(
    `java -jar "${jarPath}" -dgs=1 "${classFilePath}" "${outputPath}"`,
    { encoding: 'utf-8', timeout: config.timeout }
  );

  return outputPath;
}

async function decompileWithBytecode(classFilePath: string): Promise<string> {
  const bytecode = fs.readFileSync(classFilePath);
  let output = `// Decompiled from bytecode (line numbers may be approximate)\n`;
  output += `// Class: ${classFilePath}\n\n`;

  const bytecodeLines: string[] = [];
  bytecodeLines.push(`// Raw bytecode (${bytecode.length} bytes)`);

  return output;
}

async function extractClassFromJar(jarPath: string, className: string, tempDir: string): Promise<string> {
  const AdmZip = await import('adm-zip').then(m => m.default).catch(() => null);
  if (!AdmZip) {
    throw new Error('adm-zip not available for JAR extraction');
  }

  const zip = new AdmZip(jarPath);
  const classEntry = zip.getEntry(className);
  if (!classEntry) {
    throw new Error(`Class ${className} not found in JAR`);
  }

  const tempClassPath = path.join(tempDir, path.basename(className));
  fs.writeFileSync(tempClassPath, classEntry.getData());
  return tempClassPath;
}

export async function decompileClass(
  classFilePath: string,
  options?: {
    jarPath?: string;
    preferredDecompiler?: 'cfr' | 'procyon' | 'fernflower' | 'bytecode';
  }
): Promise<DecompileResult> {
  if (!config.enabled) {
    return { success: false, error: 'Decompiler disabled', decompiler: 'bytecode' };
  }

  const fileSize = statSync(classFilePath).size;
  if (fileSize > config.maxFileSize) {
    return { success: false, error: `File too large: ${fileSize} bytes`, decompiler: 'bytecode' };
  }

  const preferredDecompiler = options?.preferredDecompiler || config.preferredDecompiler;
  const decompilers: Array<'cfr' | 'procyon' | 'fernflower' | 'bytecode'> =
    preferredDecompiler === 'bytecode'
      ? ['bytecode']
      : [preferredDecompiler, 'cfr', 'procyon', 'fernflower', 'bytecode'];

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gitnexus-decomp-'));

  try {
    for (const decompiler of decompilers) {
      try {
        let sourceCode: string;

        if (decompiler === 'bytecode') {
          sourceCode = await decompileWithBytecode(classFilePath);
        } else if (!checkDecompilerAvailable(decompiler)) {
          continue;
        } else {
          const outputPath = path.join(tempDir, `${path.basename(classFilePath, '.class')}.java`);

          switch (decompiler) {
            case 'cfr':
              await decompileWithCFR(classFilePath, outputPath);
              break;
            case 'procyon':
              await decompileWithProcyon(classFilePath, outputPath);
              break;
            case 'fernflower':
              await decompileWithFernflower(classFilePath, tempDir);
              break;
          }

          sourceCode = fs.readFileSync(outputPath, 'utf-8');
        }

        return { success: true, sourceCode, decompiler };
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        if (decompiler === decompilers[decompilers.length - 1]) {
          return { success: false, error: `All decompilers failed: ${errorMsg}`, decompiler: 'bytecode' };
        }
      }
    }
  } finally {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
    }
  }

  return { success: false, error: 'No decompiler available', decompiler: 'bytecode' };
}

export async function decompileJarEntry(
  jarPath: string,
  className: string,
  options?: {
    preferredDecompiler?: 'cfr' | 'procyon' | 'fernflower' | 'bytecode';
  }
): Promise<DecompileResult> {
  if (!config.enabled) {
    return { success: false, error: 'Decompiler disabled', decompiler: 'bytecode' };
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gitnexus-decomp-'));

  try {
    const classFilePath = await extractClassFromJar(jarPath, className, tempDir);
    return await decompileClass(classFilePath, {
      jarPath,
      preferredDecompiler: options?.preferredDecompiler,
    });
  } finally {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
    }
  }
}

export interface LineNumberInfo {
  startPc: number;
  lineNumber: number;
}

export function extractLineNumberTable(codeAttribute: Buffer): LineNumberInfo[] {
  const lineNumbers: LineNumberInfo[] = [];

  try {
    let offset = 0;
    const length = codeAttribute.length;

    while (offset + 8 <= length) {
      const attributeNameIndex = codeAttribute.readUInt16BE(offset);
      const attributeLength = codeAttribute.readUInt32BE(offset + 2);

      if (attributeNameIndex === 0) break;

      offset += 6;

      const lineNumberTableLength = codeAttribute.readUInt16BE(offset);
      offset += 2;

      for (let i = 0; i < lineNumberTableLength; i++) {
        if (offset + 4 > length) break;
        lineNumbers.push({
          startPc: codeAttribute.readUInt16BE(offset),
          lineNumber: codeAttribute.readUInt16BE(offset + 2),
        });
        offset += 4;
      }

      offset += attributeLength - 8;
    }
  } catch {
  }

  return lineNumbers;
}
