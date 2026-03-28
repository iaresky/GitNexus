import { createReadStream, statSync, readFileSync } from 'node:fs';
import { pipeline } from 'node:stream';
import { promisify } from 'node:util';
import { createGunzip } from 'node:zlib';
import type { Readable, Transform } from 'node:stream';
import type { GraphNode, GraphRelationship, NodeLabel } from '../graph/types.js';
import { generateId } from '../../lib/utils.js';
import { parseBytecodeFile, type BytecodeParseResult, type ClassFile } from './bytecode-parser.js';

const pump = promisify(pipeline);

export interface JarIndexOptions {
  extractInnerClasses: boolean;
  maxJarSize: number;
  recursiveNestedJars: boolean;
  skipResources: boolean;
}

export const DEFAULT_JAR_OPTIONS: JarIndexOptions = {
  extractInnerClasses: true,
  maxJarSize: 100 * 1024 * 1024,
  recursiveNestedJars: false,
  skipResources: false,
};

export interface JarEntry {
  type: 'class' | 'manifest' | 'resource';
  path: string;
  data: Buffer | string;
}

export interface ManifestInfo {
  manifestVersion?: string;
  mainClass?: string;
  classPath?: string[];
  entries: Map<string, string>;
}

export interface JarAnalysisResult {
  jarPath: string;
  manifest?: ManifestInfo;
  classFiles: Map<string, BytecodeParseResult>;
  nestedJars: Map<string, JarAnalysisResult>;
  graphNodes: GraphNode[];
  graphRelationships: GraphRelationship[];
  error?: string;
}

export function parseManifest(content: string): ManifestInfo {
  const info: ManifestInfo = {
    entries: new Map(),
  };

  const lines = content.split(/\r?\n/);
  let currentKey: string | null = null;
  let currentValue = '';
  let continuation = false;

  for (const line of lines) {
    if (line.trim() === '' || line.startsWith(' ')) {
      if (currentKey !== null && continuation) {
        currentValue += line.substring(1);
        continuation = line.endsWith(' ');
        if (!continuation) {
          info.entries.set(currentKey, currentValue);
          currentKey = null;
          currentValue = '';
        }
      }
      continue;
    }

    if (currentKey !== null && !continuation) {
      info.entries.set(currentKey, currentValue);
    }

    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) continue;

    currentKey = line.substring(0, colonIndex).trim();
    currentValue = line.substring(colonIndex + 1).trim();
    continuation = currentValue.endsWith(' ');

    if (!continuation) {
      info.entries.set(currentKey, currentValue);
      currentKey = null;
      currentValue = '';
    }
  }

  if (currentKey !== null && !continuation) {
    info.entries.set(currentKey, currentValue);
  }

  if (info.entries.has('Manifest-Version')) {
    info.manifestVersion = info.entries.get('Manifest-Version');
  }

  if (info.entries.has('Main-Class')) {
    info.mainClass = info.entries.get('Main-Class');
  }

  if (info.entries.has('Class-Path')) {
    const classPath = info.entries.get('Class-Path') || '';
    info.classPath = classPath.trim().split(/\s+/).filter(s => s.length > 0);
  }

  return info;
}

async function readZipEntryData(
  zipData: Buffer,
  entryOffset: number,
  compressedSize: number,
  compressionMethod: number
): Promise<Buffer> {
  const compressedData = zipData.slice(entryOffset, entryOffset + compressedSize);

  if (compressionMethod === 0) {
    return compressedData;
  }

  if (compressionMethod === 8) {
    const gunzip = createGunzip();
    const chunks: Buffer[] = [];

    return new Promise((resolve, reject) => {
      gunzip.on('data', (chunk: Buffer) => chunks.push(chunk));
      gunzip.on('end', () => resolve(Buffer.concat(chunks)));
      gunzip.on('error', reject);

      gunzip.end(compressedData);
    });
  }

  throw new Error(`Unsupported compression method: ${compressionMethod}`);
}

async function extractZipEntries(
  buffer: Buffer
): Promise<Map<string, { data: Buffer; compression: number }>> {
  const entries = new Map<string, { data: Buffer; compression: number }>();

  if (buffer.readUInt32LE(0) !== 0x04034b50) {
    throw new Error('Invalid ZIP file: missing local file header signature');
  }

  let offset = 0;

  while (offset + 30 <= buffer.length) {
    const signature = buffer.readUInt32LE(offset);

    if (signature === 0x04034b50) {
      const compressionMethod = buffer.readUInt16LE(offset + 8);
      const compressedSize = buffer.readUInt32LE(offset + 18);
      const uncompressedSize = buffer.readUInt32LE(offset + 22);
      const fileNameLength = buffer.readUInt16LE(offset + 26);
      const extraFieldLength = buffer.readUInt16LE(offset + 28);
      const fileName = buffer.toString('utf8', offset + 30, offset + 30 + fileNameLength);

      const dataOffset = offset + 30 + fileNameLength + extraFieldLength;

      let data: Buffer;
      if (compressionMethod === 0) {
        data = buffer.slice(dataOffset, dataOffset + compressedSize);
      } else if (compressionMethod === 8) {
        const compressedData = buffer.slice(dataOffset, dataOffset + compressedSize);
        const gunzip = createGunzip();
        const chunks: Buffer[] = [];

        data = await new Promise((resolve, reject) => {
          gunzip.on('data', (chunk: Buffer) => chunks.push(chunk));
          gunzip.on('end', () => resolve(Buffer.concat(chunks)));
          gunzip.on('error', reject);

          gunzip.end(compressedData);
        });
      } else {
        offset = dataOffset + compressedSize;
        continue;
      }

      entries.set(fileName, { data, compression: compressionMethod });

      offset = dataOffset + compressedSize;
    } else if (signature === 0x02014b50) {
      break;
    } else {
      offset += 4;
    }
  }

  return entries;
}

export async function analyzeJar(
  jarPath: string,
  options: JarIndexOptions = DEFAULT_JAR_OPTIONS
): Promise<JarAnalysisResult> {
  const result: JarAnalysisResult = {
    jarPath,
    classFiles: new Map(),
    nestedJars: new Map(),
    graphNodes: [],
    graphRelationships: [],
  };

  try {
    const stats = statSync(jarPath);
    if (stats.size > options.maxJarSize) {
      result.error = `JAR file exceeds maximum size of ${options.maxJarSize} bytes`;
      return result;
    }

    const zipBuffer = readFileSync(jarPath);

    const entries = await extractZipEntries(zipBuffer);

    let manifestEntry: { data: Buffer; compression: number } | undefined;
    const classEntries: Map<string, { data: Buffer; compression: number }> = new Map();
    const resourceEntries: Map<string, { data: Buffer; compression: number }> = new Map();

    for (const [path, entry] of entries) {
      if (path === 'META-INF/MANIFEST.MF') {
        manifestEntry = entry;
      } else if (path.endsWith('.class')) {
        if (!options.extractInnerClasses && path.includes('$')) {
          continue;
        }
        classEntries.set(path, entry);
      } else if (!options.skipResources) {
        resourceEntries.set(path, entry);
      }
    }

    if (manifestEntry) {
      try {
        const manifestContent = manifestEntry.data.toString('utf8');
        result.manifest = parseManifest(manifestContent);
      } catch {
      }
    }

    const jarId = generateId('Jar', jarPath);
    const jarNode: GraphNode = {
      id: jarId,
      label: 'Module' as NodeLabel,
      properties: {
        name: jarPath.split('/').pop() || jarPath,
        filePath: jarPath,
        startLine: 0,
        endLine: 0,
        isExported: true,
        description: `JAR archive with ${classEntries.size} classes`,
      },
    } as unknown as GraphNode;

    (jarNode.properties as Record<string, unknown>).manifestMainClass = result.manifest?.mainClass;
    (jarNode.properties as Record<string, unknown>).classPath = result.manifest?.classPath || [];
    (jarNode.properties as Record<string, unknown>).entries = classEntries.size + resourceEntries.size;

    result.graphNodes.push(jarNode);

    for (const [classPath, entry] of classEntries) {
      try {
        const classResult = await parseBytecodeFile(classPath, entry.data);

        result.classFiles.set(classPath, classResult);

        for (const node of classResult.graphNodes) {
          const modifiedNode = { ...node };
          (modifiedNode.properties as Record<string, unknown>).jarId = jarId;
          result.graphNodes.push(modifiedNode);

          result.graphRelationships.push({
            id: generateId('CONTAINS', `${jarId}->${node.id}`),
            sourceId: jarId,
            targetId: node.id,
            type: 'CONTAINS',
            confidence: 1.0,
            reason: 'jar_entry',
          });
        }

        result.graphRelationships.push(...classResult.graphRelationships);
      } catch (error) {
      }
    }

    if (options.recursiveNestedJars) {
      for (const [resourcePath, entry] of resourceEntries) {
        if (resourcePath.endsWith('.jar')) {
          try {
            const nestedResult = await analyzeJar(
              resourcePath,
              { ...options, recursiveNestedJars: false }
            );
            result.nestedJars.set(resourcePath, nestedResult);
          } catch {
          }
        }
      }
    }

  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
  }

  return result;
}

export async function* streamJarEntries(
  jarPath: string,
  options: JarIndexOptions = DEFAULT_JAR_OPTIONS
): AsyncGenerator<JarEntry> {
  try {
    const zipBuffer = readFileSync(jarPath);

    const entries = await extractZipEntries(zipBuffer);

    for (const [path, entry] of entries) {
      if (path === 'META-INF/MANIFEST.MF') {
        yield {
          type: 'manifest',
          path,
          data: entry.data.toString('utf8'),
        };
      } else if (path.endsWith('.class')) {
        if (!options.extractInnerClasses && path.includes('$')) {
          continue;
        }
        yield {
          type: 'class',
          path,
          data: entry.data,
        };
      } else if (!options.skipResources) {
        yield {
          type: 'resource',
          path,
          data: entry.data,
        };
      }
    }
  } catch (error) {
  }
}

export function buildJarGraph(
  jarPath: string,
  manifest?: ManifestInfo,
  classResults?: Map<string, BytecodeParseResult>
): { nodes: GraphNode[]; relationships: GraphRelationship[] } {
  const nodes: GraphNode[] = [];
  const relationships: GraphRelationship[] = [];

  const jarId = generateId('Jar', jarPath);

  nodes.push({
    id: jarId,
    label: 'Module' as NodeLabel,
    properties: {
      name: jarPath.split('/').pop() || jarPath,
      filePath: jarPath,
      startLine: 0,
      endLine: 0,
      isExported: true,
      description: `JAR archive with ${classResults?.size || 0} classes`,
    },
  } as unknown as GraphNode);

  if (manifest) {
    (nodes[0].properties as Record<string, unknown>).manifestMainClass = manifest.mainClass;
    (nodes[0].properties as Record<string, unknown>).classPath = manifest.classPath || [];
  }

  if (manifest?.classPath) {
    for (const dep of manifest.classPath) {
      const depId = generateId('File', dep);
      relationships.push({
        id: generateId('IMPORTS', `${jarId}->${depId}`),
        sourceId: jarId,
        targetId: depId,
        type: 'IMPORTS',
        confidence: 0.8,
        reason: 'manifest_classpath',
      });
    }
  }

  if (classResults) {
    for (const [classPath, result] of classResults) {
      const classNodeId = generateId('Class', `${jarPath}:${classPath}`);

      relationships.push({
        id: generateId('CONTAINS', `${jarId}->${classNodeId}`),
        sourceId: jarId,
        targetId: classNodeId,
        type: 'CONTAINS',
        confidence: 1.0,
        reason: 'jar_entry',
      });
    }
  }

  return { nodes, relationships };
}
