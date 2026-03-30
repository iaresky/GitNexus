import { KnowledgeGraph } from '../graph/types';
import { GraphNode } from '../graph/types';
import { SinkNode, SinkCategory, SINK_PATTERNS } from './types';

function matchesSinkPattern(name: string): { category: SinkCategory; matchedBy: string } | null {
  const lowerName = name.toLowerCase();

  for (const [category, patterns] of Object.entries(SINK_PATTERNS)) {
    for (const pattern of patterns) {
      const lowerPattern = pattern.toLowerCase();
      if (lowerName.includes(lowerPattern) || lowerPattern.includes(lowerName)) {
        return {
          category: category as SinkCategory,
          matchedBy: pattern,
        };
      }
    }
  }

  const dangerousKeywords: Record<string, SinkCategory> = {
    write: SinkCategory.FILE_WRITE,
    writeto: SinkCategory.FILE_WRITE,
    outputstream: SinkCategory.FILE_WRITE,
    filewriter: SinkCategory.FILE_WRITE,
    bufferedwriter: SinkCategory.FILE_WRITE,
    exec: SinkCategory.RUNTIME_EXEC,
    runtime: SinkCategory.RUNTIME_EXEC,
    processbuilder: SinkCategory.RUNTIME_EXEC,
    definelass: SinkCategory.RUNTIME_EXEC,
    scripteval: SinkCategory.RUNTIME_EXEC,
    readobject: SinkCategory.DESERIALIZATION,
    xmldecode: SinkCategory.DESERIALIZATION,
    jsparse: SinkCategory.DESERIALIZATION,
    yaml: SinkCategory.DESERIALIZATION,
    deserialize: SinkCategory.DESERIALIZATION,
  };

  for (const [keyword, category] of Object.entries(dangerousKeywords)) {
    if (lowerName.includes(keyword)) {
      return { category, matchedBy: keyword };
    }
  }

  return null;
}

export function detectSinks(graph: KnowledgeGraph): SinkNode[] {
  const sinks: SinkNode[] = [];
  const seen = new Set<string>();

  for (const node of graph.nodes) {
    if (node.label !== 'Method' && node.label !== 'Function' && node.label !== 'Class') {
      continue;
    }

    const name = node.properties.name || '';
    if (!name) continue;

    const match = matchesSinkPattern(name);
    if (match) {
      if (seen.has(node.id)) continue;
      seen.add(node.id);

      sinks.push({
        id: node.id,
        methodName: name,
        filePath: node.properties.filePath || '',
        startLine: node.properties.startLine || 0,
        endLine: node.properties.endLine || 0,
        category: match.category,
        matchedBy: match.matchedBy,
      });
    }
  }

  return sinks;
}

export function filterSinks(sinks: SinkNode[], filter: string): SinkNode[] {
  if (!filter.trim()) return sinks;
  const lowerFilter = filter.toLowerCase();
  return sinks.filter(
    (s) =>
      s.methodName.toLowerCase().includes(lowerFilter) ||
      s.filePath.toLowerCase().includes(lowerFilter) ||
      s.category.toLowerCase().includes(lowerFilter) ||
      s.matchedBy.toLowerCase().includes(lowerFilter)
  );
}

export function getSinksByCategory(sinks: SinkNode[]): Record<SinkCategory, SinkNode[]> {
  const result: Record<SinkCategory, SinkNode[]> = {
    [SinkCategory.FILE_WRITE]: [],
    [SinkCategory.RUNTIME_EXEC]: [],
    [SinkCategory.DESERIALIZATION]: [],
  };

  for (const sink of sinks) {
    result[sink.category].push(sink);
  }

  return result;
}
