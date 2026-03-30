import { describe, it, expect } from 'vitest';
import {
  generateMermaid,
  generateHighlightConfig,
  formatPathSummary,
  generatePathList,
  getSinkCategoryColor,
} from '../../../src/core/security/path-visualizer';
import { DataFlowPath, SinkCategory } from '../../../src/core/security/types';

const createMockPath = (overrides?: Partial<DataFlowPath>): DataFlowPath => ({
  id: 'path-1',
  source: {
    id: 'source-1',
    methodName: 'uploadFile',
    filePath: 'src/controller/Upload.java',
    startLine: 10,
    endLine: 20,
    annotations: ['PostMapping'],
    matchedBy: 'both',
  },
  sink: {
    id: 'sink-1',
    methodName: 'writeBytes',
    filePath: 'src/service/FileWriter.java',
    startLine: 30,
    endLine: 40,
    category: SinkCategory.FILE_WRITE,
    matchedBy: 'write',
  },
  nodes: [
    { id: 'source-1', methodName: 'uploadFile', filePath: 'src/controller/Upload.java', type: 'source' },
    { id: 'inter-1', methodName: 'processData', filePath: 'src/service/Processor.java', type: 'intermediate' },
    { id: 'sink-1', methodName: 'writeBytes', filePath: 'src/service/FileWriter.java', type: 'sink' },
  ],
  edges: [
    { sourceId: 'source-1', targetId: 'inter-1', type: 'CALLS' },
    { sourceId: 'inter-1', targetId: 'sink-1', type: 'CALLS' },
  ],
  confidence: 0.85,
  depth: 3,
  ...overrides,
});

describe('path-visualizer', () => {
  describe('generateMermaid', () => {
    it('should generate mermaid diagram for single path', () => {
      const paths = [createMockPath()];
      const mermaid = generateMermaid(paths);

      expect(mermaid).toContain('graph TD');
      expect(mermaid).toContain('uploadFile');
      expect(mermaid).toContain('writeBytes');
      expect(mermaid).toContain('processData');
    });

    it('should generate mermaid diagram for multiple paths', () => {
      const paths = [
        createMockPath({ id: 'path-1' }),
        createMockPath({
          id: 'path-2',
          source: { ...createMockPath().source, id: 'source-2', methodName: 'handleUpload' },
          sink: { ...createMockPath().sink, id: 'sink-2', methodName: 'execCommand' },
          nodes: [
            { id: 'source-2', methodName: 'handleUpload', filePath: 'src/controller/Upload.java', type: 'source' },
            { id: 'inter-3', methodName: 'processData', filePath: 'src/service/Processor.java', type: 'intermediate' },
            { id: 'sink-2', methodName: 'execCommand', filePath: 'src/util/Executor.java', type: 'sink' },
          ],
        }),
      ];

      const mermaid = generateMermaid(paths);

      expect(mermaid).toContain('Path1');
      expect(mermaid).toContain('Path2');
      expect(mermaid).toContain('uploadFile');
      expect(mermaid).toContain('handleUpload');
    });

    it('should return empty message for no paths', () => {
      const mermaid = generateMermaid([]);
      expect(mermaid).toContain('No paths found');
    });

    it('should use arrows for edges', () => {
      const paths = [createMockPath()];
      const mermaid = generateMermaid(paths);

      expect(mermaid).toContain('-->');
    });
  });

  describe('generateHighlightConfig', () => {
    it('should highlight all nodes in path', () => {
      const paths = [createMockPath()];
      const config = generateHighlightConfig(paths);

      expect(config.highlightedNodeIds.size).toBe(3);
      expect(config.highlightedNodeIds.has('source-1')).toBe(true);
      expect(config.highlightedNodeIds.has('inter-1')).toBe(true);
      expect(config.highlightedNodeIds.has('sink-1')).toBe(true);
    });

    it('should assign correct colors to nodes', () => {
      const paths = [createMockPath()];
      const config = generateHighlightConfig(paths);

      expect(config.nodeColors.get('source-1')).toBe('#22c55e');
      expect(config.nodeColors.get('inter-1')).toBe('#eab308');
      expect(config.nodeColors.get('sink-1')).toBe('#ef4444');
    });

    it('should highlight all edges in path', () => {
      const paths = [createMockPath()];
      const config = generateHighlightConfig(paths);

      expect(config.highlightedEdgeIds.size).toBe(2);
    });

    it('should return empty config for no paths', () => {
      const config = generateHighlightConfig([]);

      expect(config.highlightedNodeIds.size).toBe(0);
      expect(config.highlightedEdgeIds.size).toBe(0);
      expect(config.nodeColors.size).toBe(0);
    });
  });

  describe('formatPathSummary', () => {
    it('should format path summary correctly', () => {
      const path = createMockPath({ confidence: 0.85, depth: 3 });
      const summary = formatPathSummary(path);

      expect(summary).toContain('uploadFile');
      expect(summary).toContain('writeBytes');
      expect(summary).toContain('3 hops');
      expect(summary).toContain('85%');
    });

    it('should format with correct confidence percentage', () => {
      const path = createMockPath({ confidence: 0.9 });
      const summary = formatPathSummary(path);

      expect(summary).toContain('90%');
    });
  });

  describe('generatePathList', () => {
    it('should generate list starting from index', () => {
      const paths = [
        createMockPath({ id: 'path-1' }),
        createMockPath({ id: 'path-2' }),
        createMockPath({ id: 'path-3' }),
      ];

      const list = generatePathList(paths, 1, 2);

      expect(list).toHaveLength(2);
      expect(list[0].index).toBe(1);
      expect(list[1].index).toBe(2);
    });

    it('should limit count to available paths', () => {
      const paths = [
        createMockPath({ id: 'path-1' }),
        createMockPath({ id: 'path-2' }),
      ];

      const list = generatePathList(paths, 0, 10);

      expect(list).toHaveLength(2);
    });

    it('should include summary in each item', () => {
      const paths = [createMockPath()];
      const list = generatePathList(paths, 0, 1);

      expect(list[0].summary).toBeTruthy();
      expect(typeof list[0].summary).toBe('string');
    });
  });

  describe('getSinkCategoryColor', () => {
    it('should return red for FILE_WRITE', () => {
      expect(getSinkCategoryColor(SinkCategory.FILE_WRITE)).toBe('#ef4444');
    });

    it('should return orange for RUNTIME_EXEC', () => {
      expect(getSinkCategoryColor(SinkCategory.RUNTIME_EXEC)).toBe('#f97316');
    });

    it('should return purple for DESERIALIZATION', () => {
      expect(getSinkCategoryColor(SinkCategory.DESERIALIZATION)).toBe('#a855f7');
    });

    it('should return default red for unknown category', () => {
      expect(getSinkCategoryColor('unknown' as SinkCategory)).toBe('#ef4444');
    });
  });
});
