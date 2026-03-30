# Interfaces

## Security Analysis Types

### SourceNode

```typescript
interface SourceNode {
  id: string;
  methodName: string;
  filePath: string;
  startLine: number;
  endLine: number;
  annotations: string[];
  matchedBy: 'annotation' | 'keyword' | 'both';
}
```

### SinkNode

```typescript
enum SinkCategory {
  FILE_WRITE = 'file_write',
  RUNTIME_EXEC = 'runtime_exec',
  DESERIALIZATION = 'deserialization',
}

interface SinkNode {
  id: string;
  methodName: string;
  filePath: string;
  startLine: number;
  endLine: number;
  category: SinkCategory;
  matchedBy: string;
}
```

### DataFlowPath

```typescript
interface PathNode {
  id: string;
  methodName: string;
  filePath: string;
  type: 'source' | 'intermediate' | 'sink';
}

interface PathEdge {
  sourceId: string;
  targetId: string;
  type: string;
}

interface DataFlowPath {
  id: string;
  source: SourceNode;
  sink: SinkNode;
  nodes: PathNode[];
  edges: PathEdge[];
  confidence: number;
  depth: number;
}
```

### HighlightConfig

```typescript
interface HighlightConfig {
  highlightedNodeIds: Set<string>;
  highlightedEdgeIds: Set<string>;
  nodeColors: Map<string, string>;
}
```

## Tracker State

### UseVulnerabilityTrackerReturn

```typescript
export interface UseVulnerabilityTrackerReturn extends VulnerabilityTrackerState {
  setViewMode: (mode: TrackerViewMode) => void;
  setMaxPathCount: (count: number) => void;
  setMaxPathDepth: (depth: number) => void;
  setSourceFilter: (filter: string) => void;
  setSinkFilter: (filter: string) => void;
  setSelectedPathIndex: (index: number) => void;
  analyze: () => Promise<void>;
  reset: () => void;
}

export type TrackerViewMode = 'graph' | 'mermaid';
```

## Component Props

### UploadTrackerPageProps

```typescript
interface UploadTrackerPageProps {
  graph: KnowledgeGraph | null;
  runQuery?: (cypher: string) => Promise<any[]>;
  onBack?: () => void;
}
```
