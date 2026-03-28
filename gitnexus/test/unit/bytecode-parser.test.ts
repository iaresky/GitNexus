import { describe, it, expect } from 'vitest';
import {
  parseClassFile,
  parseFieldDescriptor,
  parseMethodDescriptor,
  parseAccessFlags,
  analyzeMethodBytecode,
  CLASS_FILE_MAX_SIZE,
} from '../../src/core/ingestion/bytecode-parser.js';

describe('Bytecode Parser', () => {
  describe('parseFieldDescriptor', () => {
    it('should parse primitive types', () => {
      expect(parseFieldDescriptor('I')).toEqual({ type: 'int', arrayDepth: 0 });
      expect(parseFieldDescriptor('J')).toEqual({ type: 'long', arrayDepth: 0 });
      expect(parseFieldDescriptor('Z')).toEqual({ type: 'boolean', arrayDepth: 0 });
      expect(parseFieldDescriptor('B')).toEqual({ type: 'byte', arrayDepth: 0 });
      expect(parseFieldDescriptor('C')).toEqual({ type: 'char', arrayDepth: 0 });
      expect(parseFieldDescriptor('S')).toEqual({ type: 'short', arrayDepth: 0 });
      expect(parseFieldDescriptor('F')).toEqual({ type: 'float', arrayDepth: 0 });
      expect(parseFieldDescriptor('D')).toEqual({ type: 'double', arrayDepth: 0 });
    });

    it('should parse object types', () => {
      const result = parseFieldDescriptor('Ljava/lang/String;');
      expect(result.type).toBe('java/lang/String');
      expect(result.arrayDepth).toBe(0);
    });

    it('should parse array types', () => {
      const result = parseFieldDescriptor('[I');
      expect(result.type).toBe('int');
      expect(result.arrayDepth).toBe(1);
    });

    it('should parse multi-dimensional arrays', () => {
      const result = parseFieldDescriptor('[[Ljava/lang/String;');
      expect(result.type).toBe('java/lang/String');
      expect(result.arrayDepth).toBe(2);
    });
  });

  describe('parseMethodDescriptor', () => {
    it('should parse empty parameter list', () => {
      const result = parseMethodDescriptor('()V');
      expect(result.parameterTypes).toEqual([]);
      expect(result.returnType).toBe('V');
    });

    it('should parse single parameter', () => {
      const result = parseMethodDescriptor('(I)V');
      expect(result.parameterTypes).toEqual(['int']);
      expect(result.returnType).toBe('V');
    });

    it('should parse multiple parameters', () => {
      const result = parseMethodDescriptor('(ILjava/lang/String;Z)Ljava/lang/Object;');
      expect(result.parameterTypes).toEqual(['int', 'java/lang/String', 'boolean']);
      expect(result.returnType).toBe('Ljava/lang/Object;');
    });

    it('should parse array parameters', () => {
      const result = parseMethodDescriptor('([Ljava/lang/String;)V');
      expect(result.parameterTypes).toEqual(['java/lang/String[]']);
    });
  });

  describe('parseAccessFlags', () => {
    it('should parse public flag', () => {
      const flags = parseAccessFlags(0x0001);
      expect(flags).toContain('public');
    });

    it('should parse private flag', () => {
      const flags = parseAccessFlags(0x0002);
      expect(flags).toContain('private');
    });

    it('should parse protected flag', () => {
      const flags = parseAccessFlags(0x0004);
      expect(flags).toContain('protected');
    });

    it('should parse static flag', () => {
      const flags = parseAccessFlags(0x0008);
      expect(flags).toContain('static');
    });

    it('should parse final flag', () => {
      const flags = parseAccessFlags(0x0010);
      expect(flags).toContain('final');
    });

    it('should parse interface flag', () => {
      const flags = parseAccessFlags(0x0200);
      expect(flags).toContain('interface');
    });

    it('should parse abstract flag', () => {
      const flags = parseAccessFlags(0x0400);
      expect(flags).toContain('abstract');
    });

    it('should parse combined flags', () => {
      const flags = parseAccessFlags(0x0001 | 0x0010 | 0x0020);
      expect(flags).toContain('public');
      expect(flags).toContain('final');
      expect(flags).toContain('super');
    });
  });

  describe('CLASS_FILE_MAX_SIZE', () => {
    it('should be 10MB', () => {
      expect(CLASS_FILE_MAX_SIZE).toBe(10 * 1024 * 1024);
    });
  });
});

describe('ConstantPoolTag', () => {
  it('should have correct values', async () => {
    const { ConstantPoolTag } = await import('../../src/core/ingestion/bytecode-parser.js');
    
    expect(ConstantPoolTag.UTF8).toBe(1);
    expect(ConstantPoolTag.CLASS).toBe(7);
    expect(ConstantPoolTag.METHODREF).toBe(10);
    expect(ConstantPoolTag.NAME_AND_TYPE).toBe(12);
  });
});

describe('AccessFlags', () => {
  it('should have correct values', async () => {
    const { AccessFlags } = await import('../../src/core/ingestion/bytecode-parser.js');
    
    expect(AccessFlags.ACC_PUBLIC).toBe(0x0001);
    expect(AccessFlags.ACC_PRIVATE).toBe(0x0002);
    expect(AccessFlags.ACC_STATIC).toBe(0x0008);
    expect(AccessFlags.ACC_FINAL).toBe(0x0010);
    expect(AccessFlags.ACC_INTERFACE).toBe(0x0200);
    expect(AccessFlags.ACC_ABSTRACT).toBe(0x0400);
  });
});
