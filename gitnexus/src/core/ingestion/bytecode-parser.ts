import { createReadStream } from 'node:fs';
import { createGunzip } from 'node:zlib';
import { promisify } from 'node:util';
import { pipeline } from 'node:stream';
import type { Readable } from 'node:stream';
import type { GraphNode, GraphRelationship, NodeLabel } from '../graph/types.js';
import { generateId } from '../../lib/utils.js';

export type BinaryNodeLabel = 'Jar' | 'BytecodeClass' | 'BytecodeMethod' | 'BytecodeField';

export type ExtendedNodeLabel = NodeLabel | BinaryNodeLabel;

const streamPipeline = promisify(pipeline);

export const CLASS_FILE_MAX_SIZE = 10 * 1024 * 1024;

export enum ConstantPoolTag {
  UTF8 = 1,
  INTEGER = 3,
  FLOAT = 4,
  LONG = 5,
  DOUBLE = 6,
  CLASS = 7,
  STRING = 8,
  FIELDREF = 9,
  METHODREF = 10,
  INTERFACE_METHODREF = 11,
  NAME_AND_TYPE = 12,
  METHOD_HANDLE = 15,
  METHOD_TYPE = 16,
  INVOKE_DYNAMIC = 18,
}

export enum AccessFlags {
  ACC_PUBLIC = 0x0001,
  ACC_PRIVATE = 0x0002,
  ACC_PROTECTED = 0x0004,
  ACC_STATIC = 0x0008,
  ACC_FINAL = 0x0010,
  ACC_SUPER = 0x0020,
  ACC_VOLATILE = 0x0040,
  ACC_TRANSIENT = 0x0080,
  ACC_INTERFACE = 0x0200,
  ACC_ABSTRACT = 0x0400,
  ACC_SYNTHETIC = 0x1000,
  ACC_ANNOTATION = 0x2000,
  ACC_ENUM = 0x4000,
}

export interface ConstantPoolEntry {
  tag: ConstantPoolTag;
  info: Record<string, unknown>;
  offset: number;
}

export interface FieldInfo {
  accessFlags: number;
  nameIndex: number;
  descriptorIndex: number;
  attributes: AttributeInfo[];
  name?: string;
  descriptor?: string;
  attributesMap?: Map<string, AttributeInfo>;
  _offset?: number;
  _isMethod?: boolean;
}

export interface MethodInfo {
  accessFlags: number;
  nameIndex: number;
  descriptorIndex: number;
  attributes: AttributeInfo[];
  name?: string;
  descriptor?: string;
  returnType?: string;
  parameterTypes?: string[];
  maxStack?: number;
  maxLocals?: number;
  bytecodeLength?: number;
  codeAttribute?: CodeAttribute;
  attributesMap?: Map<string, AttributeInfo>;
  _offset?: number;
  _isMethod?: boolean;
}

export interface AttributeInfo {
  attributeNameIndex: number;
  attributeLength: number;
  info: Buffer;
  name?: string;
  _offset?: number;
}

export interface CodeAttribute {
  maxStack: number;
  maxLocals: number;
  code: Buffer;
  exceptionTable: ExceptionTableEntry[];
  attributes: AttributeInfo[];
}

export interface ExceptionTableEntry {
  startPc: number;
  endPc: number;
  handlerPc: number;
  catchType: number;
}

export interface ClassFile {
  version: { major: number; minor: number };
  accessFlags: number;
  thisClass: string;
  superClass: string | null;
  interfaces: string[];
  constantPool: ConstantPoolEntry[];
  fields: FieldInfo[];
  methods: MethodInfo[];
  attributes: AttributeInfo[];
  attributesMap?: Map<string, AttributeInfo>;
}

export interface CallSite {
  opcode: number;
  owner: string;
  name: string;
  descriptor: string;
  lineNumber: number;
  isDynamic: boolean;
  instructionIndex: number;
}

export interface FieldAccess {
  opcode: number;
  owner: string;
  name: string;
  descriptor: string;
  isStatic: boolean;
  isWrite: boolean;
  instructionIndex: number;
}

export interface MethodAnalysis {
  calls: CallSite[];
  fieldAccesses: FieldAccess[];
  isConstructor: boolean;
  isStaticInitializer: boolean;
}

export interface BytecodeParseResult {
  classFile: ClassFile;
  methodAnalyses: Map<string, MethodAnalysis>;
  graphNodes: GraphNode[];
  graphRelationships: GraphRelationship[];
}

const JVM_OPCODES = {
  INVOKEVIRTUAL: 182,
  INVOKESPECIAL: 183,
  INVOKESTATIC: 184,
  INVOKEINTERFACE: 185,
  INVOKEDYNAMIC: 186,
  GETFIELD: 180,
  PUTFIELD: 181,
  GETSTATIC: 178,
  PUTSTATIC: 179,
} as const;

export function parseAccessFlags(flags: number): string[] {
  const result: string[] = [];
  if (flags & AccessFlags.ACC_PUBLIC) result.push('public');
  if (flags & AccessFlags.ACC_PRIVATE) result.push('private');
  if (flags & AccessFlags.ACC_PROTECTED) result.push('protected');
  if (flags & AccessFlags.ACC_STATIC) result.push('static');
  if (flags & AccessFlags.ACC_FINAL) result.push('final');
  if (flags & AccessFlags.ACC_SUPER) result.push('super');
  if (flags & AccessFlags.ACC_VOLATILE) result.push('volatile');
  if (flags & AccessFlags.ACC_TRANSIENT) result.push('transient');
  if (flags & AccessFlags.ACC_INTERFACE) result.push('interface');
  if (flags & AccessFlags.ACC_ABSTRACT) result.push('abstract');
  if (flags & AccessFlags.ACC_SYNTHETIC) result.push('synthetic');
  if (flags & AccessFlags.ACC_ANNOTATION) result.push('annotation');
  if (flags & AccessFlags.ACC_ENUM) result.push('enum');
  return result;
}

export function parseFieldDescriptor(descriptor: string): { type: string; arrayDepth: number } {
  let type = descriptor;
  let arrayDepth = 0;

  while (type.startsWith('[')) {
    arrayDepth++;
    type = type.slice(1);
  }

  let baseType = type;
  switch (type[0]) {
    case 'B': baseType = 'byte'; break;
    case 'C': baseType = 'char'; break;
    case 'D': baseType = 'double'; break;
    case 'F': baseType = 'float'; break;
    case 'I': baseType = 'int'; break;
    case 'J': baseType = 'long'; break;
    case 'L': baseType = type.slice(1, type.indexOf(';')); break;
    case 'S': baseType = 'short'; break;
    case 'Z': baseType = 'boolean'; break;
    case 'V': baseType = 'void'; break;
    default: baseType = type;
  }

  return { type: baseType, arrayDepth };
}

export function parseMethodDescriptor(descriptor: string): {
  parameterTypes: string[];
  returnType: string;
} {
  if (!descriptor.startsWith('(')) {
    return { parameterTypes: [], returnType: descriptor };
  }

  const closeParen = descriptor.indexOf(')');
  if (closeParen === -1) {
    return { parameterTypes: [], returnType: descriptor };
  }

  const paramsStr = descriptor.slice(1, closeParen);
  const returnType = descriptor.slice(closeParen + 1);

  const parameterTypes: string[] = [];
  let i = 0;

  while (i < paramsStr.length) {
    let arrayDepth = 0;
    while (paramsStr[i] === '[') {
      arrayDepth++;
      i++;
    }

    let type: string;
    switch (paramsStr[i]) {
      case 'B': type = 'byte'; break;
      case 'C': type = 'char'; break;
      case 'D': type = 'double'; break;
      case 'F': type = 'float'; break;
      case 'I': type = 'int'; break;
      case 'J': type = 'long'; break;
      case 'L': {
        const semi = paramsStr.indexOf(';', i);
        type = paramsStr.slice(i + 1, semi);
        i = semi;
        break;
      }
      case 'S': type = 'short'; break;
      case 'Z': type = 'boolean'; break;
      case 'V': type = 'void'; break;
      default: type = paramsStr[i];
    }
    i++;

    while (arrayDepth > 0) {
      type += '[]';
      arrayDepth--;
    }

    parameterTypes.push(type);
  }

  return { parameterTypes, returnType };
}

function readUint16(buffer: Buffer, offset: number): number {
  return buffer.readUInt16BE(offset);
}

function readUint32(buffer: Buffer, offset: number): number {
  return buffer.readUInt32BE(offset);
}

function readInt16(buffer: Buffer, offset: number): number {
  return buffer.readInt16BE(offset);
}

function readInt32(buffer: Buffer, offset: number): number {
  return buffer.readInt32BE(offset);
}

function readFloat(buffer: Buffer, offset: number): number {
  return buffer.readFloatBE(offset);
}

function readDouble(buffer: Buffer, offset: number): number {
  return buffer.readDoubleBE(offset);
}

function readLong(buffer: Buffer, offset: number): bigint {
  return buffer.readBigInt64BE(offset);
}

function readConstantPoolEntry(buffer: Buffer, offset: number): { entry: ConstantPoolEntry; bytesRead: number } {
  const tag = buffer[offset] as ConstantPoolTag;
  const entry: ConstantPoolEntry = { tag, info: {}, offset };

  let bytesRead = 1;

  switch (tag) {
    case ConstantPoolTag.CLASS:
      entry.info = { nameIndex: readUint16(buffer, offset + 1) };
      bytesRead = 3;
      break;

    case ConstantPoolTag.UTF8:
      const length = readUint16(buffer, offset + 1);
      const utf8Bytes = buffer.slice(offset + 3, offset + 3 + length);
      entry.info = { length, value: utf8Bytes.toString('utf8') };
      bytesRead = 3 + length;
      break;

    case ConstantPoolTag.STRING:
      entry.info = { stringIndex: readUint16(buffer, offset + 1) };
      bytesRead = 3;
      break;

    case ConstantPoolTag.INTEGER:
      entry.info = { value: readInt32(buffer, offset + 1) };
      bytesRead = 5;
      break;

    case ConstantPoolTag.FLOAT:
      entry.info = { value: readFloat(buffer, offset + 1) };
      bytesRead = 5;
      break;

    case ConstantPoolTag.LONG:
      entry.info = { value: readLong(buffer, offset + 1) };
      bytesRead = 9;
      break;

    case ConstantPoolTag.DOUBLE:
      entry.info = { value: readDouble(buffer, offset + 1) };
      bytesRead = 9;
      break;

    case ConstantPoolTag.FIELDREF:
    case ConstantPoolTag.METHODREF:
    case ConstantPoolTag.INTERFACE_METHODREF:
      entry.info = {
        classIndex: readUint16(buffer, offset + 1),
        nameAndTypeIndex: readUint16(buffer, offset + 3),
      };
      bytesRead = 5;
      break;

    case ConstantPoolTag.NAME_AND_TYPE:
      entry.info = {
        nameIndex: readUint16(buffer, offset + 1),
        descriptorIndex: readUint16(buffer, offset + 3),
      };
      bytesRead = 5;
      break;

    case ConstantPoolTag.METHOD_HANDLE:
      entry.info = {
        referenceKind: buffer[offset + 1],
        referenceIndex: readUint16(buffer, offset + 2),
      };
      bytesRead = 4;
      break;

    case ConstantPoolTag.METHOD_TYPE:
      entry.info = { descriptorIndex: readUint16(buffer, offset + 1) };
      bytesRead = 3;
      break;

    case ConstantPoolTag.INVOKE_DYNAMIC:
      entry.info = {
        bootstrapMethodAttrIndex: readUint16(buffer, offset + 1),
        nameAndTypeIndex: readUint16(buffer, offset + 3),
      };
      bytesRead = 5;
      break;

    default:
      bytesRead = 1;
  }

  return { entry, bytesRead };
}

function resolveConstantPoolSlot(cp: ConstantPoolEntry[], index: number): ConstantPoolEntry | null {
  if (index <= 0 || index > cp.length) return null;
  return cp[index - 1];
}

function resolveClassName(cp: ConstantPoolEntry[], classIndex: number): string | null {
  const classEntry = resolveConstantPoolSlot(cp, classIndex);
  if (!classEntry || classEntry.tag !== ConstantPoolTag.CLASS) return null;

  const nameIndex = classEntry.info.nameIndex as number;
  const nameEntry = resolveConstantPoolSlot(cp, nameIndex);
  if (!nameEntry || nameEntry.tag !== ConstantPoolTag.UTF8) return null;

  return nameEntry.info.value as string;
}

function resolveNameAndType(cp: ConstantPoolEntry[], index: number): { name: string | null; descriptor: string | null } {
  const entry = resolveConstantPoolSlot(cp, index);
  if (!entry || entry.tag !== ConstantPoolTag.NAME_AND_TYPE) {
    return { name: null, descriptor: null };
  }

  const nameIndex = entry.info.nameIndex as number;
  const descIndex = entry.info.descriptorIndex as number;

  const nameEntry = resolveConstantPoolSlot(cp, nameIndex);
  const descEntry = resolveConstantPoolSlot(cp, descIndex);

  return {
    name: nameEntry?.tag === ConstantPoolTag.UTF8 ? nameEntry.info.value as string : null,
    descriptor: descEntry?.tag === ConstantPoolTag.UTF8 ? descEntry.info.value as string : null,
  };
}

function resolveMethodref(cp: ConstantPoolEntry[], index: number): { className: string | null; methodName: string | null; descriptor: string | null } {
  const entry = resolveConstantPoolSlot(cp, index);
  if (!entry || (entry.tag !== ConstantPoolTag.METHODREF && entry.tag !== ConstantPoolTag.INTERFACE_METHODREF && entry.tag !== ConstantPoolTag.FIELDREF)) {
    return { className: null, methodName: null, descriptor: null };
  }

  const className = resolveClassName(cp, entry.info.classIndex as number);
  const nameAndType = resolveNameAndType(cp, entry.info.nameAndTypeIndex as number);

  return {
    className,
    methodName: nameAndType.name,
    descriptor: nameAndType.descriptor,
  };
}

export function parseClassFile(buffer: Buffer): ClassFile {
  if (buffer.length < 10) {
    throw new Error('Invalid class file: buffer too small');
  }

  const magic = buffer.readUInt32BE(0);
  if (magic !== 0xCAFEBABE) {
    throw new Error(`Invalid class file: magic number ${magic.toString(16)} expected 0xCAFEBABE`);
  }

  const minorVersion = buffer.readUInt16BE(4);
  const majorVersion = buffer.readUInt16BE(6);

  if (majorVersion < 45 || majorVersion > 65) {
    throw new Error(`Unsupported class file version: ${majorVersion}.${minorVersion} (expected 45-65)`);
  }

  const constantPoolCount = buffer.readUInt16BE(8);
  const constantPool: ConstantPoolEntry[] = [];

  let offset = 10;
  for (let i = 1; i < constantPoolCount; i++) {
    const { entry, bytesRead } = readConstantPoolEntry(buffer, offset);
    constantPool.push(entry);
    offset += bytesRead;

    if (entry.tag === ConstantPoolTag.LONG || entry.tag === ConstantPoolTag.DOUBLE) {
      i++;
    }
  }

  for (const cpEntry of constantPool) {
    if (cpEntry.tag === ConstantPoolTag.CLASS) {
      const nameEntry = resolveConstantPoolSlot(constantPool, cpEntry.info.nameIndex as number);
      if (nameEntry && nameEntry.tag === ConstantPoolTag.UTF8) {
        cpEntry.info.name = nameEntry.info.value;
      }
    } else if (cpEntry.tag === ConstantPoolTag.UTF8) {
    } else if (cpEntry.tag === ConstantPoolTag.METHODREF || cpEntry.tag === ConstantPoolTag.FIELDREF || cpEntry.tag === ConstantPoolTag.INTERFACE_METHODREF) {
      const resolved = resolveMethodref(constantPool, constantPool.indexOf(cpEntry) + 1);
      cpEntry.info.resolvedClassName = resolved.className;
      cpEntry.info.resolvedMethodName = resolved.methodName;
      cpEntry.info.resolvedDescriptor = resolved.descriptor;
    } else if (cpEntry.tag === ConstantPoolTag.NAME_AND_TYPE) {
      const nameEntry = resolveConstantPoolSlot(constantPool, cpEntry.info.nameIndex as number);
      const descEntry = resolveConstantPoolSlot(constantPool, cpEntry.info.descriptorIndex as number);
      cpEntry.info.resolvedName = nameEntry?.tag === ConstantPoolTag.UTF8 ? nameEntry.info.value : null;
      cpEntry.info.resolvedDescriptor = descEntry?.tag === ConstantPoolTag.UTF8 ? descEntry.info.value : null;
    }
  }

  const accessFlags = buffer.readUInt16BE(offset);
  offset += 2;

  const thisClassIndex = buffer.readUInt16BE(offset);
  offset += 2;
  const thisClassName = resolveClassName(constantPool, thisClassIndex) || '';

  const superClassIndex = buffer.readUInt16BE(offset);
  offset += 2;
  const superClassName = superClassIndex > 0 ? resolveClassName(constantPool, superClassIndex) : null;

  const interfacesCount = buffer.readUInt16BE(offset);
  offset += 2;
  const interfaces: string[] = [];
  for (let i = 0; i < interfacesCount; i++) {
    const interfaceIndex = buffer.readUInt16BE(offset);
    const interfaceName = resolveClassName(constantPool, interfaceIndex);
    if (interfaceName) interfaces.push(interfaceName);
    offset += 2;
  }

  const fieldsCount = buffer.readUInt16BE(offset);
  offset += 2;
  const fields: FieldInfo[] = [];
  for (let i = 0; i < fieldsCount; i++) {
    const field = parseMember(buffer, offset, constantPool);
    fields.push(field);
    offset += field._offset!;
  }

  const methodsCount = buffer.readUInt16BE(offset);
  offset += 2;
  const methods: MethodInfo[] = [];
  for (let i = 0; i < methodsCount; i++) {
    const method = parseMember(buffer, offset, constantPool);
    methods.push(method);
    offset += method._offset!;
  }

  const attributesCount = buffer.readUInt16BE(offset);
  offset += 2;
  const attributes: AttributeInfo[] = [];
  for (let i = 0; i < attributesCount; i++) {
    const attr = parseAttribute(buffer, offset, constantPool);
    attributes.push(attr);
    offset += attr._offset!;
  }

  return {
    version: { major: majorVersion, minor: minorVersion },
    accessFlags,
    thisClass: thisClassName,
    superClass: superClassName,
    interfaces,
    constantPool,
    fields,
    methods,
    attributes,
  };
}

function parseMember(buffer: Buffer, offset: number, constantPool: ConstantPoolEntry[]): FieldInfo | MethodInfo {
  const accessFlags = buffer.readUInt16BE(offset);
  const nameIndex = buffer.readUInt16BE(offset + 2);
  const descriptorIndex = buffer.readUInt16BE(offset + 4);
  const attributesCount = buffer.readUInt16BE(offset + 6);

  const nameEntry = resolveConstantPoolSlot(constantPool, nameIndex);
  const descriptorEntry = resolveConstantPoolSlot(constantPool, descriptorIndex);

  const member: FieldInfo | MethodInfo = {
    accessFlags,
    nameIndex,
    descriptorIndex,
    attributes: [],
    name: nameEntry?.tag === ConstantPoolTag.UTF8 ? nameEntry.info.value as string : undefined,
    descriptor: descriptorEntry?.tag === ConstantPoolTag.UTF8 ? descriptorEntry.info.value as string : undefined,
  };

  let attrOffset = offset + 8;

  for (let i = 0; i < attributesCount; i++) {
    const attr = parseAttribute(buffer, attrOffset, constantPool);
    member.attributes.push(attr);
    attrOffset += attr._offset!;

    if (attr.name === 'Code' && member._isMethod) {
      const code = parseCodeAttribute(attr.info);
      (member as MethodInfo).maxStack = code.maxStack;
      (member as MethodInfo).maxLocals = code.maxLocals;
      (member as MethodInfo).bytecodeLength = code.code.length;
      (member as MethodInfo).codeAttribute = code;
    }
  }

  member._offset = attrOffset - offset;

  return member;
}

function parseAttribute(buffer: Buffer, offset: number, constantPool: ConstantPoolEntry[]): AttributeInfo {
  const attributeNameIndex = buffer.readUInt16BE(offset);
  const attributeLength = buffer.readUInt32BE(offset + 4);

  const nameEntry = resolveConstantPoolSlot(constantPool, attributeNameIndex);
  const attrName = nameEntry?.tag === ConstantPoolTag.UTF8 ? nameEntry.info.value as string : `attr_${attributeNameIndex}`;

  const info = buffer.slice(offset + 6, offset + 6 + attributeLength);

  const attribute: AttributeInfo = {
    attributeNameIndex,
    attributeLength,
    info,
    name: attrName,
  };

  attribute._offset = 6 + attributeLength;

  return attribute;
}

function parseCodeAttribute(buffer: Buffer): CodeAttribute {
  const maxStack = buffer.readUInt16BE(0);
  const maxLocals = buffer.readUInt16BE(2);
  const codeLength = buffer.readUInt32BE(4);

  const code = buffer.slice(8, 8 + codeLength);
  let offset = 8 + codeLength;

  const exceptionTableLength = buffer.readUInt16BE(offset);
  offset += 2;

  const exceptionTable: ExceptionTableEntry[] = [];
  for (let i = 0; i < exceptionTableLength; i++) {
    exceptionTable.push({
      startPc: buffer.readUInt16BE(offset),
      endPc: buffer.readUInt16BE(offset + 2),
      handlerPc: buffer.readUInt16BE(offset + 4),
      catchType: buffer.readUInt16BE(offset + 6),
    });
    offset += 8;
  }

  const attributesCount = buffer.readUInt16BE(offset);
  offset += 2;

  const attributes: AttributeInfo[] = [];
  for (let i = 0; i < attributesCount; i++) {
    const attr = parseAttribute(buffer, offset, []);
    attributes.push(attr);
    offset += attr._offset!;
  }

  return {
    maxStack,
    maxLocals,
    code,
    exceptionTable,
    attributes,
  };
}

export function analyzeMethodBytecode(code: Buffer, constantPool: ConstantPoolEntry[]): MethodAnalysis {
  const calls: CallSite[] = [];
  const fieldAccesses: FieldAccess[] = [];

  let offset = 0;
  let instructionIndex = 0;

  while (offset < code.length) {
    const opcode = code[offset];

    switch (opcode) {
      case JVM_OPCODES.INVOKEVIRTUAL:
      case JVM_OPCODES.INVOKESPECIAL:
      case JVM_OPCODES.INVOKESTATIC: {
        if (offset + 3 <= code.length) {
          const index = code.readUInt16BE(offset + 1);
          const methodref = resolveConstantPoolSlot(constantPool, index);
          if (methodref && methodref.tag === ConstantPoolTag.METHODREF) {
            calls.push({
              opcode,
              owner: (methodref.info.resolvedClassName as string) || '',
              name: (methodref.info.resolvedMethodName as string) || '',
              descriptor: (methodref.info.resolvedDescriptor as string) || '',
              lineNumber: 0,
              isDynamic: false,
              instructionIndex,
            });
          }
        }
        break;
      }

      case JVM_OPCODES.INVOKEINTERFACE: {
        if (offset + 4 <= code.length) {
          const index = code.readUInt16BE(offset + 1);
          const methodref = resolveConstantPoolSlot(constantPool, index);
          if (methodref && methodref.tag === ConstantPoolTag.INTERFACE_METHODREF) {
            calls.push({
              opcode,
              owner: (methodref.info.resolvedClassName as string) || '',
              name: (methodref.info.resolvedMethodName as string) || '',
              descriptor: (methodref.info.resolvedDescriptor as string) || '',
              lineNumber: 0,
              isDynamic: false,
              instructionIndex,
            });
          }
        }
        break;
      }

      case JVM_OPCODES.INVOKEDYNAMIC: {
        if (offset + 3 <= code.length) {
          const index = code.readUInt16BE(offset + 1);
          const invokeDynamic = resolveConstantPoolSlot(constantPool, index);
          if (invokeDynamic && invokeDynamic.tag === ConstantPoolTag.INVOKE_DYNAMIC) {
            const nameAndType = resolveNameAndType(constantPool, invokeDynamic.info.nameAndTypeIndex as number);
            calls.push({
              opcode,
              owner: '',
              name: nameAndType.name || '',
              descriptor: nameAndType.descriptor || '',
              lineNumber: 0,
              isDynamic: true,
              instructionIndex,
            });
          }
        }
        break;
      }

      case JVM_OPCODES.GETFIELD:
      case JVM_OPCODES.PUTFIELD:
      case JVM_OPCODES.GETSTATIC:
      case JVM_OPCODES.PUTSTATIC: {
        if (offset + 3 <= code.length) {
          const index = code.readUInt16BE(offset + 1);
          const fieldref = resolveConstantPoolSlot(constantPool, index);
          if (fieldref && fieldref.tag === ConstantPoolTag.FIELDREF) {
            const owner = (fieldref.info.resolvedClassName as string) || '';
            const name = (fieldref.info.resolvedMethodName as string) || '';
            const desc = (fieldref.info.resolvedDescriptor as string) || '';
            fieldAccesses.push({
              opcode,
              owner,
              name,
              descriptor: desc,
              isStatic: opcode === JVM_OPCODES.GETSTATIC || opcode === JVM_OPCODES.PUTSTATIC,
              isWrite: opcode === JVM_OPCODES.PUTFIELD || opcode === JVM_OPCODES.PUTSTATIC,
              instructionIndex,
            });
          }
        }
        break;
      }
    }

    const instructionLength = getInstructionLength(opcode);
    offset += instructionLength;
    instructionIndex++;
  }

  return {
    calls,
    fieldAccesses,
    isConstructor: false,
    isStaticInitializer: false,
  };
}

function getInstructionLength(opcode: number): number {
  if (opcode === 203 || opcode === 254 || opcode === 255 || opcode === 196) {
    return 4;
  }
  if (opcode >= 200 && opcode <= 216) {
    return 3;
  }
  if (opcode >= 153 && opcode <= 168) {
    return 3;
  }
  if (opcode >= 178 && opcode <= 186 && opcode !== 179 && opcode !== 180 && opcode !== 181 && opcode !== 182 && opcode !== 183 && opcode !== 184 && opcode !== 185 && opcode !== 186) {
    return 3;
  }
  if ((opcode >= 16 && opcode <= 18) || (opcode >= 21 && opcode <= 25) || opcode === 54 || opcode === 55 || opcode === 56 || opcode === 57 || opcode === 58) {
    return 2;
  }
  if (opcode === 185 || opcode === 186 || opcode === 196) {
    return 4;
  }
  if (opcode >= 200 && opcode <= 222) {
    return 5;
  }
  return 1;
}

export function analyzeMethod(classFile: ClassFile, method: MethodInfo): MethodAnalysis {
  if (!method.name) {
    return { calls: [], fieldAccesses: [], isConstructor: false, isStaticInitializer: false };
  }

  const analysis: MethodAnalysis = {
    calls: [],
    fieldAccesses: [],
    isConstructor: method.name === '<init>',
    isStaticInitializer: method.name === '<clinit>',
  };

  if (!method.codeAttribute) {
    return analysis;
  }

  const code = method.codeAttribute.code;
  const bytecodeAnalysis = analyzeMethodBytecode(code, classFile.constantPool);

  analysis.calls = bytecodeAnalysis.calls;
  analysis.fieldAccesses = bytecodeAnalysis.fieldAccesses;

  return analysis;
}

export function buildClassGraphNodes(
  classFile: ClassFile,
  filePath: string,
  jarId?: string
): { nodes: GraphNode[]; relationships: GraphRelationship[] } {
  const nodes: GraphNode[] = [];
  const relationships: GraphRelationship[] = [];

  const classId = generateId('BytecodeClass', `${filePath}:${classFile.thisClass}`);

  const isInterface = (classFile.accessFlags & AccessFlags.ACC_INTERFACE) !== 0;

  nodes.push({
    id: classId,
    label: 'Class' as NodeLabel,
    properties: {
      name: classFile.thisClass,
      filePath,
      startLine: 0,
      endLine: 0,
      isExported: (classFile.accessFlags & AccessFlags.ACC_PUBLIC) !== 0,
      isStatic: false,
      declaredType: classFile.thisClass,
      visibility: parseAccessFlags(classFile.accessFlags).find(f => ['public', 'private', 'protected'].includes(f)) || 'package-private',
      description: `Java class file v${classFile.version.major}.${classFile.version.minor}`,
    },
  } as unknown as GraphNode);

  const packageName = classFile.thisClass.includes('.')
    ? classFile.thisClass.slice(0, classFile.thisClass.lastIndexOf('.'))
    : 'default';

  (nodes[0].properties as Record<string, unknown>).package = packageName;
  (nodes[0].properties as Record<string, unknown>).isInterface = isInterface;
  (nodes[0].properties as Record<string, unknown>).accessFlags = parseAccessFlags(classFile.accessFlags);
  (nodes[0].properties as Record<string, unknown>).version = `${classFile.version.major}.${classFile.version.minor}`;
  if (jarId) {
    (nodes[0].properties as Record<string, unknown>).jarId = jarId;
  }

  if (classFile.superClass) {
    const superClassId = generateId('BytecodeClass', `${filePath}:${classFile.superClass}`);
    relationships.push({
      id: generateId('EXTENDS', `${classId}->${superClassId}`),
      sourceId: classId,
      targetId: superClassId,
      type: 'EXTENDS',
      confidence: 1.0,
      reason: 'super_class',
    });
  }

  for (const iface of classFile.interfaces) {
    const ifaceId = generateId('BytecodeClass', `${filePath}:${iface}`);
    relationships.push({
      id: generateId('IMPLEMENTS', `${classId}->${ifaceId}`),
      sourceId: classId,
      targetId: ifaceId,
      type: 'IMPLEMENTS',
      confidence: 1.0,
      reason: 'interface',
    });
  }

  for (const field of classFile.fields) {
    if (!field.name) continue;

    const fieldId = generateId('BytecodeField', `${filePath}:${classFile.thisClass}.${field.name}`);
    const { type: fieldType } = field.descriptor ? parseFieldDescriptor(field.descriptor) : { type: 'unknown' };

    nodes.push({
      id: fieldId,
      label: 'Property',
      properties: {
        name: field.name,
        filePath,
        startLine: 0,
        endLine: 0,
        declaredType: fieldType,
        visibility: parseAccessFlags(field.accessFlags).find(f => ['public', 'private', 'protected'].includes(f)) || 'package-private',
        isStatic: (field.accessFlags & AccessFlags.ACC_STATIC) !== 0,
        isReadonly: (field.accessFlags & AccessFlags.ACC_FINAL) !== 0,
      },
    } as GraphNode);

    relationships.push({
      id: generateId('HAS_BYTECODE_FIELD', `${classId}->${fieldId}`),
      sourceId: classId,
      targetId: fieldId,
      type: 'HAS_PROPERTY',
      confidence: 1.0,
      reason: 'field_declaration',
    });
  }

  for (const method of classFile.methods) {
    if (!method.name) continue;

    const methodId = generateId('BytecodeMethod', `${filePath}:${classFile.thisClass}.${method.name}${method.descriptor || ''}`);

    const methodDescriptor = method.descriptor || '()V';
    const { parameterTypes, returnType } = parseMethodDescriptor(methodDescriptor);

    nodes.push({
      id: methodId,
      label: 'Method',
      properties: {
        name: method.name,
        filePath,
        startLine: 0,
        endLine: 0,
        parameterTypes,
        returnType,
        visibility: parseAccessFlags(method.accessFlags).find(f => ['public', 'private', 'protected'].includes(f)) || 'package-private',
        isStatic: (method.accessFlags & AccessFlags.ACC_STATIC) !== 0,
        maxStack: method.maxStack,
        maxLocals: method.maxLocals,
        bytecodeLength: method.bytecodeLength,
      },
    } as GraphNode);

    relationships.push({
      id: generateId('HAS_BYTECODE_METHOD', `${classId}->${methodId}`),
      sourceId: classId,
      targetId: methodId,
      type: 'HAS_METHOD',
      confidence: 1.0,
      reason: 'method_declaration',
    });
  }

  return { nodes, relationships };
}

export async function parseBytecodeFile(filePath: string, buffer: Buffer): Promise<BytecodeParseResult> {
  const classFile = parseClassFile(buffer);

  const methodAnalyses = new Map<string, MethodAnalysis>();
  const allNodes: GraphNode[] = [];
  const allRelationships: GraphRelationship[] = [];

  const { nodes, relationships } = buildClassGraphNodes(classFile, filePath);
  allNodes.push(...nodes);
  allRelationships.push(...relationships);

  const classId = generateId('BytecodeClass', `${filePath}:${classFile.thisClass}`);

  for (const method of classFile.methods) {
    if (!method.name) continue;

    const analysis = analyzeMethod(classFile, method);
    methodAnalyses.set(`${classFile.thisClass}.${method.name}`, analysis);

    const methodId = generateId('BytecodeMethod', `${filePath}:${classFile.thisClass}.${method.name}${method.descriptor || ''}`);

    for (const call of analysis.calls) {
      if (!call.owner || !call.name) continue;

      const targetClassId = generateId('BytecodeClass', `${filePath}:${call.owner}`);
      const targetMethodId = generateId('BytecodeMethod', `${filePath}:${call.owner}.${call.name}${call.descriptor || ''}`);

      const resolvedTargetId = methodId;
      const confidence = call.isDynamic ? 0.5 : 1.0;

      allRelationships.push({
        id: generateId('CALLS', `${methodId}->${resolvedTargetId}`),
        sourceId: methodId,
        targetId: resolvedTargetId,
        type: 'CALLS',
        confidence,
        reason: call.isDynamic ? 'dynamic_dispatch' : 'bytecode_invocation',
      });
    }

    for (const access of analysis.fieldAccesses) {
      if (!access.owner || !access.name) continue;

      const fieldId = generateId('BytecodeField', `${filePath}:${access.owner}.${access.name}`);

      allRelationships.push({
        id: generateId('ACCESSES', `${methodId}->${fieldId}`),
        sourceId: methodId,
        targetId: fieldId,
        type: 'ACCESSES',
        confidence: 1.0,
        reason: access.isWrite ? 'putfield' : 'getfield',
      });
    }
  }

  return {
    classFile,
    methodAnalyses,
    graphNodes: allNodes,
    graphRelationships: allRelationships,
  };
}

export async function streamParseBytecodeFile(
  filePath: string,
  stream: Readable,
  options?: { maxSize?: number }
): Promise<BytecodeParseResult> {
  const maxSize = options?.maxSize || CLASS_FILE_MAX_SIZE;

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalSize = 0;

    stream.on('data', (chunk: Buffer) => {
      totalSize += chunk.length;
      if (totalSize > maxSize) {
        stream.destroy();
        reject(new Error(`Class file ${filePath} exceeds maximum size of ${maxSize} bytes`));
        return;
      }
      chunks.push(chunk);
    });

    stream.on('end', async () => {
      try {
        const buffer = Buffer.concat(chunks);
        const result = await parseBytecodeFile(filePath, buffer);
        resolve(result);
      } catch (error) {
        reject(error);
      }
    });

    stream.on('error', reject);
  });
}
