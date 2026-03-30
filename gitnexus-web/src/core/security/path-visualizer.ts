import { DataFlowPath, PathNode, HighlightConfig, SinkCategory } from './types';

const NODE_COLORS = {
  source: '#22c55e',
  sink: '#ef4444',
  intermediate: '#eab308',
} as const;

function escapeMermaidLabel(label: string): string {
  if (!label) return '""';
  const escaped = label
    .replace(/"/g, "'")
    .replace(/\n/g, ' ')
    .replace(/\\/g, '\\\\')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  if (escaped.includes(':') || escaped.includes('(') || escaped.includes(')') ||
      escaped.includes('[') || escaped.includes(']') || escaped.includes('{') ||
      escaped.includes('}') || escaped.includes('-') || escaped.includes('/')) {
    return `"${escaped}"`;
  }
  return escaped;
}

function getMethodLabel(node: PathNode): string {
  const fileName = node.filePath ? node.filePath.split('/').pop() || node.filePath : '';
  return `${node.methodName}`;
}

function getNodeId(pathIndex: number, nodeIndex: number): string {
  return `p${pathIndex}_n${nodeIndex}`;
}

export function generateMermaid(paths: DataFlowPath[]): string {
  if (paths.length === 0) {
    return 'graph TD\n    A["No paths found"]';
  }

  const lines: string[] = ['graph TD'];

  for (let pathIdx = 0; pathIdx < paths.length; pathIdx++) {
    const path = paths[pathIdx];
    const pathPrefix = paths.length > 1 ? `Path${pathIdx + 1}: ` : '';

    for (let i = 0; i < path.nodes.length; i++) {
      const node = path.nodes[i];
      const nodeId = getNodeId(pathIdx, i);
      const color = NODE_COLORS[node.type];
      const label = pathPrefix + getMethodLabel(node);

      lines.push(`    ${nodeId}["${label}"]`);
    }

    for (let i = 0; i < path.edges.length; i++) {
      const edge = path.edges[i];
      const fromIdx = path.nodes.findIndex((n) => n.id === edge.sourceId);
      const toIdx = path.nodes.findIndex((n) => n.id === edge.targetId);

      if (fromIdx !== -1 && toIdx !== -1) {
        const fromId = getNodeId(pathIdx, fromIdx);
        const toId = getNodeId(pathIdx, toIdx);
        const edgeLabel = edge.type ? `|${edge.type}|` : '';
        lines.push(`    ${fromId} -->${edgeLabel} ${toId}`);
      }
    }
  }

  return lines.join('\n');
}

export function generateHighlightConfig(paths: DataFlowPath[]): HighlightConfig {
  const highlightedNodeIds = new Set<string>();
  const highlightedEdgeIds = new Set<string>();
  const nodeColors = new Map<string, string>();

  for (const path of paths) {
    for (const node of path.nodes) {
      highlightedNodeIds.add(node.id);
      if (!nodeColors.has(node.id)) {
        nodeColors.set(node.id, NODE_COLORS[node.type]);
      }
    }

    for (const edge of path.edges) {
      const edgeId = `${edge.sourceId}-${edge.type}-${edge.targetId}`;
      highlightedEdgeIds.add(edgeId);
    }
  }

  return { highlightedNodeIds, highlightedEdgeIds, nodeColors };
}

export function getSinkCategoryColor(category: SinkCategory): string {
  switch (category) {
    case SinkCategory.FILE_WRITE:
      return '#ef4444';
    case SinkCategory.RUNTIME_EXEC:
      return '#f97316';
    case SinkCategory.DESERIALIZATION:
      return '#a855f7';
    default:
      return '#ef4444';
  }
}

export function formatPathSummary(path: DataFlowPath): string {
  const sourceName = path.source.methodName;
  const sinkName = path.sink.methodName;
  const depth = path.depth;
  const confidence = (path.confidence * 100).toFixed(0);

  return `${sourceName} → ${sinkName} (${depth} hops, ${confidence}% confidence)`;
}

export function generatePathList(
  paths: DataFlowPath[],
  startIndex: number,
  count: number
): Array<{ index: number; path: DataFlowPath; summary: string }> {
  const result = [];
  for (let i = startIndex; i < Math.min(startIndex + count, paths.length); i++) {
    result.push({
      index: i,
      path: paths[i],
      summary: formatPathSummary(paths[i]),
    });
  }
  return result;
}
