export enum SinkCategory {
  FILE_WRITE = 'file_write',
  RUNTIME_EXEC = 'runtime_exec',
  DESERIALIZATION = 'deserialization',
}

export interface SourceNode {
  id: string;
  methodName: string;
  filePath: string;
  startLine: number;
  endLine: number;
  annotations: string[];
  matchedBy: 'annotation' | 'keyword' | 'both';
}

export interface SinkNode {
  id: string;
  methodName: string;
  filePath: string;
  startLine: number;
  endLine: number;
  category: SinkCategory;
  matchedBy: string;
}

export interface PathNode {
  id: string;
  methodName: string;
  filePath: string;
  type: 'source' | 'intermediate' | 'sink';
}

export interface PathEdge {
  sourceId: string;
  targetId: string;
  type: string;
}

export interface DataFlowPath {
  id: string;
  source: SourceNode;
  sink: SinkNode;
  nodes: PathNode[];
  edges: PathEdge[];
  confidence: number;
  depth: number;
}

export interface HighlightConfig {
  highlightedNodeIds: Set<string>;
  highlightedEdgeIds: Set<string>;
  nodeColors: Map<string, string>;
}

export const SOURCE_ANNOTATIONS = [
  'RequestMapping',
  'GetMapping',
  'PostMapping',
  'PutMapping',
  'DeleteMapping',
  'PatchMapping',
] as const;

export const SOURCE_KEYWORDS = [
  'upload',
  'uploadFile',
  'doUpload',
  'handleUpload',
  'importFile',
  'attach',
  'postFile',
  'fileUpload',
] as const;

export const SINK_PATTERNS: Record<SinkCategory, readonly string[]> = {
  [SinkCategory.FILE_WRITE]: [
    'FileOutputStream.write',
    'Files.write',
    'FileWriter.write',
    'BufferedWriter.write',
    'writeBytes',
    'transferTo',
  ],
  [SinkCategory.RUNTIME_EXEC]: [
    'Runtime.exec',
    'ProcessBuilder.start',
    'ClassLoader.defineClass',
    'ScriptEngine.eval',
  ],
  [SinkCategory.DESERIALIZATION]: [
    'ObjectInputStream.readObject',
    'XMLDecoder.readObject',
    'Yaml.load',
    'JSON.parse',
  ],
};

export type SourceAnnotation = typeof SOURCE_ANNOTATIONS[number];
export type SourceKeyword = typeof SOURCE_KEYWORDS[number];
