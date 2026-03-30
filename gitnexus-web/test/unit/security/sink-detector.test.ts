import { describe, it, expect } from 'vitest';
import { detectSinks, filterSinks, getSinksByCategory } from '../../../src/core/security/sink-detector';
import { KnowledgeGraph } from '../../../src/core/graph/types';
import { SinkCategory } from '../../../src/core/security/types';

const createMockGraph = (nodes: Partial<KnowledgeGraph['nodes'][0]>[]): KnowledgeGraph => ({
  nodes: nodes.map(n => ({
    id: n.id || 'test-id',
    label: n.label || 'Method',
    properties: {
      name: n.properties?.name || '',
      filePath: n.properties?.filePath || '',
      startLine: n.properties?.startLine || 0,
      endLine: n.properties?.endLine || 0,
    },
  })),
  relationships: [],
});

describe('sink-detector', () => {
  describe('detectSinks', () => {
    it('should detect FileOutputStream.write as file_write sink', () => {
      const graph = createMockGraph([
        {
          id: 'sink-1',
          label: 'Method',
          properties: {
            name: 'writeFileToStream',
            filePath: 'src/util/FileHelper.java',
          },
        },
      ]);

      const sinks = detectSinks(graph);
      expect(sinks).toHaveLength(1);
      expect(sinks[0].category).toBe(SinkCategory.FILE_WRITE);
    });

    it('should detect Files.write as file_write sink', () => {
      const graph = createMockGraph([
        {
          id: 'sink-2',
          label: 'Method',
          properties: {
            name: 'Files.write',
            filePath: 'src/util/FileUtil.java',
          },
        },
      ]);

      const sinks = detectSinks(graph);
      expect(sinks.some(s => s.methodName === 'Files.write')).toBe(true);
    });

    it('should detect Runtime.exec as runtime_exec sink', () => {
      const graph = createMockGraph([
        {
          id: 'sink-3',
          label: 'Method',
          properties: {
            name: 'executeCommand',
            filePath: 'src/util/CommandUtil.java',
          },
        },
      ]);

      const sinks = detectSinks(graph);
      const execSinks = sinks.filter(s => s.category === SinkCategory.RUNTIME_EXEC);
      expect(execSinks.length).toBeGreaterThan(0);
    });

    it('should detect ClassLoader.defineClass as runtime_exec sink', () => {
      const graph = createMockGraph([
        {
          id: 'sink-4',
          label: 'Method',
          properties: {
            name: 'defineClass',
            filePath: 'src/dynamic/ClassLoaderUtil.java',
          },
        },
      ]);

      const sinks = detectSinks(graph);
      const defineClassSink = sinks.find(s => s.methodName === 'defineClass');
      expect(defineClassSink).toBeDefined();
      expect(defineClassSink?.category).toBe(SinkCategory.RUNTIME_EXEC);
    });

    it('should detect ObjectInputStream.readObject as deserialization sink', () => {
      const graph = createMockGraph([
        {
          id: 'sink-5',
          label: 'Method',
          properties: {
            name: 'readObject',
            filePath: 'src/serialize/ObjectReader.java',
          },
        },
      ]);

      const sinks = detectSinks(graph);
      const deserializationSinks = sinks.filter(s => s.category === SinkCategory.DESERIALIZATION);
      expect(deserializationSinks.length).toBeGreaterThan(0);
    });

    it('should not detect safe methods', () => {
      const graph = createMockGraph([
        {
          id: 'safe-1',
          label: 'Method',
          properties: {
            name: 'getUserById',
            filePath: 'src/service/UserService.java',
          },
        },
        {
          id: 'safe-2',
          label: 'Method',
          properties: {
            name: 'calculateSum',
            filePath: 'src/util/MathUtil.java',
          },
        },
      ]);

      const sinks = detectSinks(graph);
      expect(sinks).toHaveLength(0);
    });

    it('should detect multiple sinks in same graph', () => {
      const graph = createMockGraph([
        { id: 'sink-a', label: 'Method', properties: { name: 'writeBytes', filePath: 'a.java' } },
        { id: 'sink-b', label: 'Method', properties: { name: 'exec', filePath: 'b.java' } },
        { id: 'safe', label: 'Method', properties: { name: 'getData', filePath: 'c.java' } },
      ]);

      const sinks = detectSinks(graph);
      expect(sinks).toHaveLength(2);
    });

    it('should handle transferTo as file_write sink', () => {
      const graph = createMockGraph([
        {
          id: 'sink-transfer',
          label: 'Method',
          properties: {
            name: 'transferTo',
            filePath: 'src/upload/UploadHandler.java',
          },
        },
      ]);

      const sinks = detectSinks(graph);
      const transferSink = sinks.find(s => s.methodName === 'transferTo');
      expect(transferSink).toBeDefined();
      expect(transferSink?.category).toBe(SinkCategory.FILE_WRITE);
    });
  });

  describe('filterSinks', () => {
    it('should filter sinks by method name', () => {
      const sinks = [
        { id: '1', methodName: 'writeFile', filePath: 'a.java', startLine: 1, endLine: 10, category: SinkCategory.FILE_WRITE, matchedBy: 'write' },
        { id: '2', methodName: 'readFile', filePath: 'b.java', startLine: 1, endLine: 10, category: SinkCategory.FILE_WRITE, matchedBy: 'read' },
        { id: '3', methodName: 'execCommand', filePath: 'c.java', startLine: 1, endLine: 10, category: SinkCategory.RUNTIME_EXEC, matchedBy: 'exec' },
      ];

      const filtered = filterSinks(sinks, 'writeFile');
      expect(filtered).toHaveLength(1);
      expect(filtered[0].methodName).toBe('writeFile');
    });

    it('should filter sinks by category', () => {
      const sinks = [
        { id: '1', methodName: 'write', filePath: 'a.java', startLine: 1, endLine: 10, category: SinkCategory.FILE_WRITE, matchedBy: 'write' },
        { id: '2', methodName: 'exec', filePath: 'b.java', startLine: 1, endLine: 10, category: SinkCategory.RUNTIME_EXEC, matchedBy: 'exec' },
      ];

      const filtered = filterSinks(sinks, 'runtime_exec');
      expect(filtered).toHaveLength(1);
      expect(filtered[0].category).toBe(SinkCategory.RUNTIME_EXEC);
    });

    it('should return all sinks for empty filter', () => {
      const sinks = [
        { id: '1', methodName: 'write', filePath: 'a.java', startLine: 1, endLine: 10, category: SinkCategory.FILE_WRITE, matchedBy: 'write' },
      ];

      const filtered = filterSinks(sinks, '');
      expect(filtered).toHaveLength(1);
    });
  });

  describe('getSinksByCategory', () => {
    it('should group sinks by category', () => {
      const sinks = [
        { id: '1', methodName: 'write', filePath: 'a.java', startLine: 1, endLine: 10, category: SinkCategory.FILE_WRITE, matchedBy: 'write' },
        { id: '2', methodName: 'exec', filePath: 'b.java', startLine: 1, endLine: 10, category: SinkCategory.RUNTIME_EXEC, matchedBy: 'exec' },
        { id: '3', methodName: 'readObject', filePath: 'c.java', startLine: 1, endLine: 10, category: SinkCategory.DESERIALIZATION, matchedBy: 'readObject' },
      ];

      const grouped = getSinksByCategory(sinks);

      expect(grouped[SinkCategory.FILE_WRITE]).toHaveLength(1);
      expect(grouped[SinkCategory.RUNTIME_EXEC]).toHaveLength(1);
      expect(grouped[SinkCategory.DESERIALIZATION]).toHaveLength(1);
    });

    it('should handle empty sinks array', () => {
      const grouped = getSinksByCategory([]);

      expect(grouped[SinkCategory.FILE_WRITE]).toHaveLength(0);
      expect(grouped[SinkCategory.RUNTIME_EXEC]).toHaveLength(0);
      expect(grouped[SinkCategory.DESERIALIZATION]).toHaveLength(0);
    });
  });
});
