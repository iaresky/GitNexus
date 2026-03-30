import { KnowledgeGraph } from '../graph/types';
import { GraphNode } from '../graph/types';
import { SourceNode, SOURCE_ANNOTATIONS, SOURCE_KEYWORDS } from './types';

function matchesAnnotation(node: GraphNode): boolean {
  const content = node.properties.content || '';
  const upperContent = content.toUpperCase();
  return SOURCE_ANNOTATIONS.some(
    (ann) => upperContent.includes(`@${ann.toLowerCase()}`) || upperContent.includes(`@${ann.toUpperCase()}`)
  );
}

function matchesKeyword(node: GraphNode): boolean {
  const name = node.properties.name || '';
  const lowerName = name.toLowerCase();
  return SOURCE_KEYWORDS.some((kw) => lowerName.includes(kw.toLowerCase()));
}

export function detectSources(graph: KnowledgeGraph): SourceNode[] {
  const sources: SourceNode[] = [];
  const seen = new Set<string>();

  for (const node of graph.nodes) {
    if (node.label !== 'Method' && node.label !== 'Function' && node.label !== 'Class') {
      continue;
    }

    const name = node.properties.name || '';
    if (!name) continue;

    const matchedAnnotation = matchesAnnotation(node);
    const matchedKeyword = matchesKeyword(node);

    if (matchedAnnotation || matchedKeyword) {
      if (seen.has(node.id)) continue;
      seen.add(node.id);

      const matchedBy: SourceNode['matchedBy'] = matchedAnnotation && matchedKeyword
        ? 'both'
        : matchedAnnotation
        ? 'annotation'
        : 'keyword';

      const annotations: string[] = [];
      if (matchedAnnotation) {
        SOURCE_ANNOTATIONS.forEach((ann) => {
          const upperContent = (node.properties.content || '').toUpperCase();
          if (upperContent.includes(`@${ann.toLowerCase()}`)) {
            annotations.push(ann);
          }
        });
      }

      sources.push({
        id: node.id,
        methodName: name,
        filePath: node.properties.filePath || '',
        startLine: node.properties.startLine || 0,
        endLine: node.properties.endLine || 0,
        annotations,
        matchedBy,
      });
    }
  }

  return sources;
}

export function filterSources(sources: SourceNode[], filter: string): SourceNode[] {
  if (!filter.trim()) return sources;
  const lowerFilter = filter.toLowerCase();
  return sources.filter(
    (s) =>
      s.methodName.toLowerCase().includes(lowerFilter) ||
      s.filePath.toLowerCase().includes(lowerFilter) ||
      s.annotations.some((a) => a.toLowerCase().includes(lowerFilter))
  );
}
