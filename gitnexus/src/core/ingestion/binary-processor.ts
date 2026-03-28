import fs from 'fs/promises';
import path from 'path';
import { readFileSync } from 'fs';
import type { GraphNode, GraphRelationship } from '../graph/types.js';
import { generateId } from '../../lib/utils.js';
import { parseBytecodeFile, type BytecodeParseResult } from './bytecode-parser.js';
import { analyzeJar, type JarIndexOptions, DEFAULT_JAR_OPTIONS, type ManifestInfo, type JarAnalysisResult } from './jar-analyzer.js';
import { parseJsp, buildJspGraph, analyzeJspCalls } from './jsp-parser.js';
import {
  shouldIndexJar,
  shouldIndexClass,
  shouldIndexJsp,
  getMaxJarSize,
  shouldRecursiveNestedJars,
} from '../../config/binary-indexing-config.js';

export interface BinaryProcessResult {
  jarFiles: JarAnalysisResult[];
  classFiles: BytecodeParseResult[];
  jspFiles: { jsp: ReturnType<typeof parseJsp>; nodes: GraphNode[]; relationships: GraphRelationship[] }[];
  graphNodes: GraphNode[];
  graphRelationships: GraphRelationship[];
  errors: { path: string; error: string }[];
}

export async function processJarFile(
  jarPath: string,
  repoPath: string
): Promise<{
  jarResult: import('./jar-analyzer.js').JarAnalysisResult;
  graphNodes: GraphNode[];
  graphRelationships: GraphRelationship[];
}> {
  const options: JarIndexOptions = {
    ...DEFAULT_JAR_OPTIONS,
    maxJarSize: getMaxJarSize(),
    recursiveNestedJars: shouldRecursiveNestedJars(),
  };

  const jarResult = await analyzeJar(jarPath, options);
  const graphNodes: GraphNode[] = [];
  const graphRelationships: GraphRelationship[] = [];

  if (jarResult.error) {
    return { jarResult, graphNodes, graphRelationships };
  }

  graphNodes.push(...jarResult.graphNodes);
  graphRelationships.push(...jarResult.graphRelationships);

  return { jarResult, graphNodes, graphRelationships };
}

export async function processClassFile(
  classPath: string,
  repoPath: string
): Promise<{
  classResult: BytecodeParseResult;
  graphNodes: GraphNode[];
  graphRelationships: GraphRelationship[];
}> {
  const fullPath = path.join(repoPath, classPath);
  const buffer = readFileSync(fullPath);

  const classResult = await parseBytecodeFile(classPath, buffer);

  return {
    classResult,
    graphNodes: classResult.graphNodes,
    graphRelationships: classResult.graphRelationships,
  };
}

export async function processJspFile(
  jspPath: string,
  repoPath: string
): Promise<{
  jsp: ReturnType<typeof parseJsp>;
  nodes: GraphNode[];
  relationships: GraphRelationship[];
}> {
  const fullPath = path.join(repoPath, jspPath);
  const content = await fs.readFile(fullPath, 'utf-8');

  const jsp = parseJsp(content, jspPath);
  const { nodes, relationships } = buildJspGraph(jsp);

  return { jsp, nodes, relationships };
}

export async function processBinaryFiles(
  repoPath: string,
  filePaths: string[]
): Promise<BinaryProcessResult> {
  const result: BinaryProcessResult = {
    jarFiles: [],
    classFiles: [],
    jspFiles: [],
    graphNodes: [],
    graphRelationships: [],
    errors: [],
  };

  const jarPaths: string[] = [];
  const classPaths: string[] = [];
  const jspPaths: string[] = [];

  for (const filePath of filePaths) {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.jar' && shouldIndexJar()) {
      jarPaths.push(filePath);
    } else if (ext === '.class' && shouldIndexClass()) {
      classPaths.push(filePath);
    } else if (ext === '.jsp' && shouldIndexJsp()) {
      jspPaths.push(filePath);
    }
  }

  for (const jarPath of jarPaths) {
    try {
      const { jarResult, graphNodes, graphRelationships } = await processJarFile(jarPath, repoPath);
      result.jarFiles.push(jarResult);
      result.graphNodes.push(...graphNodes);
      result.graphRelationships.push(...graphRelationships);
    } catch (error) {
      result.errors.push({
        path: jarPath,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  for (const classPath of classPaths) {
    try {
      const { classResult, graphNodes, graphRelationships } = await processClassFile(classPath, repoPath);
      result.classFiles.push(classResult);
      result.graphNodes.push(...graphNodes);
      result.graphRelationships.push(...graphRelationships);
    } catch (error) {
      result.errors.push({
        path: classPath,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  for (const jspPath of jspPaths) {
    try {
      const { jsp, nodes, relationships } = await processJspFile(jspPath, repoPath);
      result.jspFiles.push({ jsp, nodes, relationships });
      result.graphNodes.push(...nodes);
      result.graphRelationships.push(...relationships);
    } catch (error) {
      result.errors.push({
        path: jspPath,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return result;
}

export function detectBinaryFiles(
  allPaths: string[]
): { jarPaths: string[]; classPaths: string[]; jspPaths: string[] } {
  const jarPaths: string[] = [];
  const classPaths: string[] = [];
  const jspPaths: string[] = [];

  for (const filePath of allPaths) {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.jar') {
      jarPaths.push(filePath);
    } else if (ext === '.class') {
      classPaths.push(filePath);
    } else if (ext === '.jsp') {
      jspPaths.push(filePath);
    }
  }

  return { jarPaths, classPaths, jspPaths };
}
