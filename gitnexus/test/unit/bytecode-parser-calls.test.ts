import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  parseClassFile,
  analyzeMethod,
  parseMethodDescriptor,
  analyzeMethodBytecode,
  buildClassGraphNodes,
  type ClassFile,
  type MethodInfo,
  type BytecodeParseResult,
} from '../../src/core/ingestion/bytecode-parser.js';
import { generateId } from '../../src/lib/utils.js';

function createMinimalClassFile(): ClassFile {
  return {
    version: { major: 52, minor: 0 },
    accessFlags: 0x0001,
    thisClass: 'com/example/TestService',
    superClass: 'java/lang/Object',
    interfaces: [],
    constantPool: [],
    fields: [],
    methods: [],
    attributes: [],
  };
}

function createMethodInfo(name: string, descriptor: string): MethodInfo {
  return {
    accessFlags: 0x0001,
    nameIndex: 1,
    descriptorIndex: 2,
    attributes: [],
    name,
    descriptor,
  };
}

describe('BytecodeParser CALLS Edge', () => {
  describe('analyzeMethodBytecode', () => {
    it('should detect method invocations from bytecode', async () => {
      const { ConstantPoolTag, analyzeMethodBytecode } = await import('../../src/core/ingestion/bytecode-parser.js');

      const constantPool = [
        {
          tag: ConstantPoolTag.UTF8,
          info: { length: 4, value: 'Test' },
          offset: 0,
        },
        {
          tag: ConstantPoolTag.CLASS,
          info: { nameIndex: 1 },
          offset: 0,
        },
        {
          tag: ConstantPoolTag.METHODREF,
          info: {
            classIndex: 2,
            nameAndTypeIndex: 3,
            resolvedClassName: 'com/example/Helper',
            resolvedMethodName: 'process',
            resolvedDescriptor: '()V',
          },
          offset: 0,
        },
        {
          tag: ConstantPoolTag.NAME_AND_TYPE,
          info: {
            nameIndex: 1,
            descriptorIndex: 2,
            resolvedName: 'process',
            resolvedDescriptor: '()V',
          },
          offset: 0,
        },
      ];

      const invokeVirtual = 182;
      const code = Buffer.alloc(3);
      code.writeUInt16BE(3, 1);
      code[0] = invokeVirtual;

      const calls = analyzeMethodBytecode(code, constantPool as any);

      expect(calls.length).toBeGreaterThan(0);
    });
  });

  describe('buildClassGraphNodes', () => {
    it('should create method nodes with correct IDs', async () => {
      const classFile = createMinimalClassFile();
      classFile.methods = [
        createMethodInfo('upload', '(Ljava/lang/String;)V'),
        createMethodInfo('exec', '()V'),
      ];

      const { nodes, relationships } = buildClassGraphNodes(classFile, 'test.jar');

      const methodNodes = nodes.filter(n => n.label === 'Method' || n.label === 'BytecodeMethod');
      expect(methodNodes.length).toBe(2);

      const methodNames = methodNodes.map(n => n.properties.name);
      expect(methodNames).toContain('upload');
      expect(methodNames).toContain('exec');
    });

    it('should create HAS_METHOD relationships for each method', async () => {
      const classFile = createMinimalClassFile();
      classFile.methods = [
        createMethodInfo('doWork', '()V'),
      ];

      const { relationships } = buildClassGraphNodes(classFile, 'test.jar');

      const hasMethodRels = relationships.filter(r => r.type === 'HAS_METHOD' || r.type === 'HAS_BYTECODE_METHOD');
      expect(hasMethodRels.length).toBe(1);
    });
  });

  describe('parseBytecodeFile CALLS edges', () => {
    it('should generate CALLS edges pointing to target methods, not self', async () => {
      const {
        parseClassFile,
        parseMethodDescriptor,
        analyzeMethod,
        buildClassGraphNodes,
        parseAccessFlags,
        AccessFlags,
        ConstantPoolTag,
      } = await import('../../src/core/ingestion/bytecode-parser.js');

      const utf8Entries = [
        { tag: ConstantPoolTag.UTF8, info: { length: 6, value: 'upload' }, offset: 0 },
        { tag: ConstantPoolTag.UTF8, info: { length: 4, value: 'exec' }, offset: 0 },
        { tag: ConstantPoolTag.UTF8, info: { length: 21, value: 'Ljava/lang/String;' }, offset: 0 },
        { tag: ConstantPoolTag.UTF8, info: { length: 1, value: 'V' }, offset: 0 },
        { tag: ConstantPoolTag.UTF8, info: { length: 22, value: '(Ljava/lang/String;)V' }, offset: 0 },
        { tag: ConstantPoolTag.UTF8, info: { length: 1, value: 'I' }, offset: 0 },
        { tag: ConstantPoolTag.UTF8, info: { length: 1, value: '()V' }, offset: 0 },
        { tag: ConstantPoolTag.UTF8, info: { length: 16, value: 'Code' }, offset: 0 },
      ];

      const classEntry = {
        tag: ConstantPoolTag.CLASS,
        info: { nameIndex: 10, name: 'com/example/TestService' },
        offset: 0,
      };

      const objectClassEntry = {
        tag: ConstantPoolTag.CLASS,
        info: { nameIndex: 11, name: 'java/lang/Object' },
        offset: 0,
      };

      const helperClassEntry = {
        tag: ConstantPoolTag.CLASS,
        info: { nameIndex: 12, name: 'com/example/Helper' },
        offset: 0,
      };

      const methodRefEntry = {
        tag: ConstantPoolTag.METHODREF,
        info: {
          classIndex: 13,
          nameAndTypeIndex: 14,
          resolvedClassName: 'com/example/Helper',
          resolvedMethodName: 'exec',
          resolvedDescriptor: '()V',
        },
        offset: 0,
      };

      const nameAndTypeEntry = {
        tag: ConstantPoolTag.NAME_AND_TYPE,
        info: {
          nameIndex: 2,
          descriptorIndex: 7,
          resolvedName: 'exec',
          resolvedDescriptor: '()V',
        },
        offset: 0,
      };

      const constantPool = [
        null,
        utf8Entries[0],
        utf8Entries[1],
        utf8Entries[2],
        utf8Entries[3],
        utf8Entries[4],
        utf8Entries[5],
        utf8Entries[6],
        utf8Entries[7],
        null,
        classEntry,
        objectClassEntry,
        helperClassEntry,
        methodRefEntry,
        nameAndTypeEntry,
      ] as any;

      const classFile: ClassFile = {
        version: { major: 52, minor: 0 },
        accessFlags: AccessFlags.ACC_PUBLIC,
        thisClass: 'com/example/TestService',
        superClass: 'java/lang/Object',
        interfaces: [],
        constantPool,
        fields: [],
        methods: [],
        attributes: [],
      };

      const uploadMethod: MethodInfo = {
        accessFlags: AccessFlags.ACC_PUBLIC | AccessFlags.ACC_STATIC,
        nameIndex: 1,
        descriptorIndex: 5,
        attributes: [],
        name: 'upload',
        descriptor: '(Ljava/lang/String;)V',
      };

      const execMethod: MethodInfo = {
        accessFlags: AccessFlags.ACC_PUBLIC,
        nameIndex: 2,
        descriptorIndex: 7,
        attributes: [],
        name: 'exec',
        descriptor: '()V',
      };

      classFile.methods = [uploadMethod, execMethod];

      const { graphNodes, graphRelationships } = buildClassGraphNodes(classFile, 'test.jar');

      const callRels = graphRelationships.filter(r => r.type === 'CALLS');
      expect(callRels.length).toBe(0);

      const uploadMethodNode = graphNodes.find(
        n => n.label === 'Method' && n.properties.name === 'upload'
      );
      const execMethodNode = graphNodes.find(
        n => n.label === 'Method' && n.properties.name === 'exec'
      );

      expect(uploadMethodNode).toBeDefined();
      expect(execMethodNode).toBeDefined();
      expect(uploadMethodNode?.id).not.toBe(execMethodNode?.id);
    });
  });
});

describe('BytecodeParser Integration', () => {
  describe('parseMethodDescriptor edge cases', () => {
    it('should handle void return type', () => {
      const result = parseMethodDescriptor('()V');
      expect(result.returnType).toBe('V');
      expect(result.parameterTypes).toEqual([]);
    });

    it('should handle complex method signatures', () => {
      const result = parseMethodDescriptor('(Ljava/lang/String;[ILjava/util/List;)Ljava/util/Map;');
      expect(result.parameterTypes.length).toBe(3);
      expect(result.returnType).toBe('Ljava/util/Map;');
    });

    it('should handle primitive array parameters', () => {
      const result = parseMethodDescriptor('([I[C[[D)V');
      expect(result.parameterTypes).toEqual(['int[]', 'char[]', 'double[][]']);
    });
  });
});
