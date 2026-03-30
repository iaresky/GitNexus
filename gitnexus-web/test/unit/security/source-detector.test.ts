import { describe, it, expect } from 'vitest';
import { detectSources, filterSources } from '../../../src/core/security/source-detector';
import { KnowledgeGraph } from '../../../src/core/graph/types';

const createMockGraph = (nodes: Partial<KnowledgeGraph['nodes'][0]>[]): KnowledgeGraph => ({
  nodes: nodes.map(n => ({
    id: n.id || 'test-id',
    label: n.label || 'Method',
    properties: {
      name: n.properties?.name || '',
      filePath: n.properties?.filePath || '',
      startLine: n.properties?.startLine || 0,
      endLine: n.properties?.endLine || 0,
      content: n.properties?.content || '',
    },
  })),
  relationships: [],
});

describe('source-detector', () => {
  describe('detectSources', () => {
    it('should detect methods with Spring annotations', () => {
      const graph = createMockGraph([
        {
          id: 'method-1',
          label: 'Method',
          properties: {
            name: 'handleFileUpload',
            filePath: 'src/controller/UploadController.java',
            content: '@PostMapping\npublic void handleFileUpload() {}',
          },
        },
      ]);

      const sources = detectSources(graph);
      expect(sources).toHaveLength(1);
      expect(sources[0].methodName).toBe('handleFileUpload');
      expect(sources[0].matchedBy).toBe('both');
    });

    it('should detect methods with upload-related keywords', () => {
      const graph = createMockGraph([
        {
          id: 'method-2',
          label: 'Method',
          properties: {
            name: 'uploadFile',
            filePath: 'src/service/FileService.java',
          },
        },
      ]);

      const sources = detectSources(graph);
      expect(sources).toHaveLength(1);
      expect(sources[0].methodName).toBe('uploadFile');
      expect(sources[0].matchedBy).toBe('keyword');
    });

    it('should detect methods matching both annotation and keyword', () => {
      const graph = createMockGraph([
        {
          id: 'method-3',
          label: 'Method',
          properties: {
            name: 'doUpload',
            filePath: 'src/controller/UploadController.java',
            content: '@PostMapping\npublic void doUpload() {}',
          },
        },
      ]);

      const sources = detectSources(graph);
      expect(sources).toHaveLength(1);
      expect(sources[0].matchedBy).toBe('both');
    });

    it('should not detect non-upload methods', () => {
      const graph = createMockGraph([
        {
          id: 'method-4',
          label: 'Method',
          properties: {
            name: 'getUserById',
            filePath: 'src/service/UserService.java',
          },
        },
      ]);

      const sources = detectSources(graph);
      expect(sources).toHaveLength(0);
    });

    it('should handle various Spring annotations', () => {
      const annotations = ['RequestMapping', 'GetMapping', 'PostMapping', 'PutMapping', 'DeleteMapping', 'PatchMapping'];
      const graph = createMockGraph(
        annotations.map((ann, i) => ({
          id: `method-${i}`,
          label: 'Method',
          properties: {
            name: `handler${i}`,
            filePath: 'src/controller/Test.java',
            content: `@${ann}\npublic void handler${i}() {}`,
          },
        }))
      );

      const sources = detectSources(graph);
      expect(sources).toHaveLength(6);
    });

    it('should handle case-insensitive keyword matching', () => {
      const graph = createMockGraph([
        {
          id: 'method-5',
          label: 'Method',
          properties: {
            name: 'UPLOAD',
            filePath: 'src/service/Upload.java',
          },
        },
      ]);

      const sources = detectSources(graph);
      expect(sources).toHaveLength(1);
    });

    it('should filter out duplicate nodes', () => {
      const graph = createMockGraph([
        {
          id: 'method-duplicate',
          label: 'Method',
          properties: {
            name: 'uploadFile',
            filePath: 'src/service/FileService.java',
          },
        },
      ]);

      const sources = detectSources(graph);
      expect(sources).toHaveLength(1);
    });
  });

  describe('filterSources', () => {
    it('should filter sources by method name', () => {
      const sources = [
        { id: '1', methodName: 'uploadFile', filePath: 'a.java', startLine: 1, endLine: 10, annotations: [], matchedBy: 'keyword' as const },
        { id: '2', methodName: 'handleUpload', filePath: 'b.java', startLine: 1, endLine: 10, annotations: [], matchedBy: 'keyword' as const },
        { id: '3', methodName: 'getUser', filePath: 'c.java', startLine: 1, endLine: 10, annotations: [], matchedBy: 'keyword' as const },
      ];

      const filtered = filterSources(sources, 'upload');
      expect(filtered).toHaveLength(2);
    });

    it('should filter sources by file path', () => {
      const sources = [
        { id: '1', methodName: 'upload', filePath: 'upload/UploadController.java', startLine: 1, endLine: 10, annotations: [], matchedBy: 'keyword' as const },
        { id: '2', methodName: 'upload', filePath: 'other/file.java', startLine: 1, endLine: 10, annotations: [], matchedBy: 'keyword' as const },
      ];

      const filtered = filterSources(sources, 'upload/');
      expect(filtered).toHaveLength(1);
      expect(filtered[0].filePath).toBe('upload/UploadController.java');
    });

    it('should return all sources for empty filter', () => {
      const sources = [
        { id: '1', methodName: 'upload', filePath: 'a.java', startLine: 1, endLine: 10, annotations: [], matchedBy: 'keyword' as const },
      ];

      const filtered = filterSources(sources, '');
      expect(filtered).toHaveLength(1);
    });
  });
});
