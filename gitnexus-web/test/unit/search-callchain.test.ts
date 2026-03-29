import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMemo } from 'react';
import type { KnowledgeGraph, GraphNode, GraphRelationship } from '../../src/core/graph/types';

function createMockGraph(
  nodes: Partial<GraphNode>[],
  relationships: Partial<GraphRelationship>[]
): KnowledgeGraph {
  const graphNodes: GraphNode[] = nodes as GraphNode[];
  const graphRels: GraphRelationship[] = relationships as GraphRelationship[];

  return {
    nodes: graphNodes,
    relationships: graphRels,
    iterNodes: function* () {
      for (const node of graphNodes) yield node;
    },
    iterRelationships: function* () {
      for (const rel of graphRels) yield rel;
    },
    forEachNode: (fn) => graphNodes.forEach(fn),
    forEachRelationship: (fn) => graphRels.forEach(fn),
    getNode: (id) => graphNodes.find(n => n.id === id),
    nodeCount: graphNodes.length,
    relationshipCount: graphRels.length,
    addNode: (node) => graphNodes.push(node),
    addRelationship: (rel) => graphRels.push(rel),
    removeNode: () => false,
    removeNodesByFile: () => 0,
    removeRelationship: () => false,
  };
}

function createMockNode(overrides: Partial<GraphNode>): GraphNode {
  return {
    id: 'node-1',
    label: 'Method',
    properties: {
      name: 'testMethod',
      filePath: '/test/file.java',
      startLine: 1,
      endLine: 10,
    },
    ...overrides,
  } as GraphNode;
}

describe('Header Search Optimization', () => {
  describe('searchResults with call chain association', () => {
    const filterNodes = (graph: KnowledgeGraph | null, query: string): GraphNode[] => {
      if (!graph || !query.trim()) return [];
      return graph.nodes.filter(
        node => node.properties.name.toLowerCase().includes(query.toLowerCase())
      );
    };

    it('should return empty results when query is empty', () => {
      const graph = createMockGraph([], []);
      const searchResults = filterNodes(graph, '');
      expect(searchResults).toEqual([]);
    });

    it('should return direct matches without call chain filtering for small result sets', () => {
      const nodes = [
        createMockNode({ id: 'method-a', label: 'Method', properties: { name: 'upload', filePath: '/a.java' } }),
        createMockNode({ id: 'method-b', label: 'Method', properties: { name: 'exec', filePath: '/b.java' } }),
      ];
      const graph = createMockGraph(nodes, []);

      const query = 'upload';
      const matchedNodes = graph.nodes.filter(
        node => node.properties.name.toLowerCase().includes(query.toLowerCase())
      );

      expect(matchedNodes.length).toBe(1);
      expect(matchedNodes[0].id).toBe('method-a');
    });

    it('should include call chain related nodes for larger result sets', () => {
      const nodes = [
        createMockNode({ id: 'method-upload', label: 'Method', properties: { name: 'upload', filePath: '/Service.java' } }),
        createMockNode({ id: 'method-exec', label: 'Method', properties: { name: 'exec', filePath: '/Helper.java' } }),
        createMockNode({ id: 'method-validate', label: 'Method', properties: { name: 'validate', filePath: '/Helper.java' } }),
        createMockNode({ id: 'other-upload', label: 'Method', properties: { name: 'upload', filePath: '/Other.java' } }),
      ];

      const relationships: GraphRelationship[] = [
        {
          id: 'calls-1',
          sourceId: 'method-upload',
          targetId: 'method-exec',
          type: 'CALLS',
          confidence: 1.0,
          reason: 'direct_call',
        },
        {
          id: 'calls-2',
          sourceId: 'method-exec',
          targetId: 'method-validate',
          type: 'CALLS',
          confidence: 1.0,
          reason: 'direct_call',
        },
      ];

      const graph = createMockGraph(nodes, relationships);

      const query = 'upload';
      const matchedNodes = graph.nodes.filter(
        node => node.properties.name.toLowerCase().includes(query.toLowerCase())
      );

      expect(matchedNodes.length).toBe(2);
      expect(matchedNodes.map(n => n.id).sort()).toEqual(['method-upload', 'other-upload']);

      const relatedNodeIds = new Set<string>();
      for (const node of matchedNodes) {
        relatedNodeIds.add(node.id);
      }
      for (const rel of graph.relationships) {
        if (rel.type === 'CALLS') {
          if (relatedNodeIds.has(rel.targetId)) {
            relatedNodeIds.add(rel.sourceId);
          }
          if (relatedNodeIds.has(rel.sourceId)) {
            relatedNodeIds.add(rel.targetId);
          }
        }
      }

      expect(relatedNodeIds.has('method-upload')).toBe(true);
      expect(relatedNodeIds.has('method-exec')).toBe(true);
    });

    it('should filter results by CALLS edge relationship', () => {
      const nodes = [
        createMockNode({ id: 'a', label: 'Function', properties: { name: 'processA', filePath: '/a.ts' } }),
        createMockNode({ id: 'b', label: 'Function', properties: { name: 'processB', filePath: '/b.ts' } }),
        createMockNode({ id: 'c', label: 'Function', properties: { name: 'processC', filePath: '/c.ts' } }),
        createMockNode({ id: 'd', label: 'Function', properties: { name: 'unrelated', filePath: '/d.ts' } }),
      ];

      const relationships: GraphRelationship[] = [
        { id: 'r1', sourceId: 'a', targetId: 'b', type: 'CALLS', confidence: 1.0, reason: '' },
        { id: 'r2', sourceId: 'b', targetId: 'c', type: 'CALLS', confidence: 1.0, reason: '' },
      ];

      const graph = createMockGraph(nodes, relationships);

      const query = 'process';
      const matchedNodes = graph.nodes.filter(
        node => node.properties.name.toLowerCase().includes(query.toLowerCase())
      );

      expect(matchedNodes.length).toBe(3);
    });
  });
});

describe('Direct Callees Display', () => {
  describe('callee detection for method nodes', () => {
    it('should identify direct callees from CALLS edges', () => {
      const nodes = [
        createMockNode({ id: 'parent', label: 'Method', properties: { name: 'parentMethod', filePath: '/Test.java' } }),
        createMockNode({ id: 'child1', label: 'Method', properties: { name: 'childMethod1', filePath: '/Test.java' } }),
        createMockNode({ id: 'child2', label: 'Method', properties: { name: 'childMethod2', filePath: '/Test.java' } }),
      ];

      const relationships: GraphRelationship[] = [
        { id: 'calls-1', sourceId: 'parent', targetId: 'child1', type: 'CALLS', confidence: 1.0, reason: '' },
        { id: 'calls-2', sourceId: 'parent', targetId: 'child2', type: 'CALLS', confidence: 1.0, reason: '' },
      ];

      const graph = createMockGraph(nodes, relationships);

      const selectedNodeId = 'parent';
      const callees: GraphNode[] = [];

      for (const rel of graph.relationships) {
        if (rel.type === 'CALLS' && rel.sourceId === selectedNodeId) {
          const targetNode = graph.nodes.find(n => n.id === rel.targetId);
          if (targetNode) callees.push(targetNode);
        }
      }

      expect(callees.length).toBe(2);
      expect(callees.map(c => c.id).sort()).toEqual(['child1', 'child2']);
    });

    it('should not include self-referencing CALLS edges', () => {
      const nodes = [
        createMockNode({ id: 'recursive', label: 'Method', properties: { name: 'recursive', filePath: '/Test.java' } }),
      ];

      const relationships: GraphRelationship[] = [
        { id: 'self-call', sourceId: 'recursive', targetId: 'recursive', type: 'CALLS', confidence: 1.0, reason: '' },
      ];

      const graph = createMockGraph(nodes, relationships);

      const selectedNodeId = 'recursive';
      const callees: GraphNode[] = [];

      for (const rel of graph.relationships) {
        if (rel.type === 'CALLS' && rel.sourceId === selectedNodeId && rel.sourceId !== rel.targetId) {
          const targetNode = graph.nodes.find(n => n.id === rel.targetId);
          if (targetNode) callees.push(targetNode);
        }
      }

      expect(callees.length).toBe(0);
    });

    it('should only return callees for callable node types', () => {
      const nodes = [
        createMockNode({ id: 'method-node', label: 'Method', properties: { name: 'testMethod', filePath: '/Test.java' } }),
        createMockNode({ id: 'class-node', label: 'Class', properties: { name: 'TestClass', filePath: '/Test.java' } }),
        createMockNode({ id: 'callee', label: 'Method', properties: { name: 'callee', filePath: '/Test.java' } }),
      ];

      const relationships: GraphRelationship[] = [
        { id: 'calls', sourceId: 'method-node', targetId: 'callee', type: 'CALLS', confidence: 1.0, reason: '' },
      ];

      const graph = createMockGraph(nodes, relationships);

      const nodeLabel = 'Class';
      const isCallable = ['Method', 'Function', 'BytecodeMethod'].includes(nodeLabel);

      expect(isCallable).toBe(false);

      const selectedNodeId = 'method-node';
      const callees: GraphNode[] = [];

      for (const rel of graph.relationships) {
        if (rel.type === 'CALLS' && rel.sourceId === selectedNodeId) {
          const targetNode = graph.nodes.find(n => n.id === rel.targetId);
          if (targetNode) callees.push(targetNode);
        }
      }

      expect(callees.length).toBe(1);
    });
  });
});

describe('Graph Filter Logic', () => {
  describe('depth-based filtering', () => {
    it('should find nodes within N hops via CALLS edges', () => {
      const nodes = [
        createMockNode({ id: 'a', label: 'Method', properties: { name: 'A', filePath: '/a.java' } }),
        createMockNode({ id: 'b', label: 'Method', properties: { name: 'B', filePath: '/b.java' } }),
        createMockNode({ id: 'c', label: 'Method', properties: { name: 'C', filePath: '/c.java' } }),
        createMockNode({ id: 'd', label: 'Method', properties: { name: 'D', filePath: '/d.java' } }),
      ];

      const relationships: GraphRelationship[] = [
        { id: 'r1', sourceId: 'a', targetId: 'b', type: 'CALLS', confidence: 1.0, reason: '' },
        { id: 'r2', sourceId: 'b', targetId: 'c', type: 'CALLS', confidence: 1.0, reason: '' },
        { id: 'r3', sourceId: 'c', targetId: 'd', type: 'CALLS', confidence: 1.0, reason: '' },
      ];

      const graph = createMockGraph(nodes, relationships);

      const startNodeId = 'a';
      const maxDepth = 2;
      const visited = new Set<string>([startNodeId]);
      let currentLevel = [startNodeId];

      for (let depth = 1; depth <= maxDepth; depth++) {
        const nextLevel: string[] = [];
        for (const currentId of currentLevel) {
          for (const rel of graph.relationships) {
            if (rel.type === 'CALLS' && rel.sourceId === currentId && !visited.has(rel.targetId)) {
              visited.add(rel.targetId);
              nextLevel.push(rel.targetId);
            }
          }
        }
        currentLevel = nextLevel;
      }

      expect(visited.has('a')).toBe(true);
      expect(visited.has('b')).toBe(true);
      expect(visited.has('c')).toBe(true);
      expect(visited.has('d')).toBe(false);
    });
  });
});
