import type { GraphNode, GraphRelationship, NodeLabel } from '../graph/types.js';
import { generateId } from '../../lib/utils.js';

export interface ImportStatement {
  type: 'page' | 'taglib' | 'include';
  value: string;
  prefix?: string;
  uri?: string;
  lineNumber: number;
}

export interface JspCodeBlock {
  type: 'declaration' | 'scriptlet' | 'expression';
  content: string;
  lineNumber: number;
  ast: unknown;
}

export interface HtmlElement {
  tag: string;
  attributes: Record<string, string>;
  lineNumber: number;
}

export interface JspFile {
  path: string;
  imports: ImportStatement[];
  declarations: JspCodeBlock[];
  scriptlets: JspCodeBlock[];
  expressions: JspCodeBlock[];
  htmlElements: HtmlElement[];
  elExpressions: string[];
}

const JSP_DECLARATION_PATTERN = /<%!\s*([\s\S]*?)%>/g;
const JSP_SCRIPTLET_PATTERN = /<%\s*([^%]*?)%>/g;
const JSP_EXPRESSION_PATTERN = /<%=\s*([^%]*?)%>/g;
const JSP_PAGE_DIRECTIVE_PATTERN = /<%@\s*page\s+([^%]*?)%>/gi;
const JSP_INCLUDE_DIRECTIVE_PATTERN = /<%@\s*include\s+file=["']([^"']+)["']\s*%>/gi;
const JSP_TAGLIB_DIRECTIVE_PATTERN = /<%@\s*taglib\s+(?:uri=["']([^"']+)["']\s+)?prefix=["']([^"']+)["']\s*%>/gi;
const JSP_EL_PATTERN = /\$\{([^}]+)\}/g;

const HTML_FORM_PATTERN = /<form\b[^>]*\s+action=["']([^"']*)["'][^>]*>/gi;
const HTML_ANCHOR_PATTERN = /<a\b[^>]*\s+href=["']([^"']*)["'][^>]*>/gi;
const HTML_SCRIPT_PATTERN = /<script\b[^>]*\s+src=["']([^"']*)["'][^>]*>/gi;
const HTML_LINK_PATTERN = /<link\b[^>]*\s+href=["']([^"']*)["'][^>]*>/gi;

export function parseJsp(content: string, filePath: string): JspFile {
  const lines = content.split('\n');
  const result: JspFile = {
    path: filePath,
    imports: [],
    declarations: [],
    scriptlets: [],
    expressions: [],
    htmlElements: [],
    elExpressions: [],
  };

  for (const match of content.matchAll(JSP_PAGE_DIRECTIVE_PATTERN)) {
    const directiveContent = match[1];
    const importMatches = directiveContent.match(/import=["']([^"']*)["']/gi);
    if (importMatches) {
      for (const importMatch of importMatches) {
        const importValue = importMatch.match(/import=["']([^"']*)["']/);
        if (importValue) {
          result.imports.push({
            type: 'page',
            value: importValue[1],
            lineNumber: content.substring(0, match.index).split('\n').length,
          });
        }
      }
    }
  }

  for (const match of content.matchAll(JSP_INCLUDE_DIRECTIVE_PATTERN)) {
    result.imports.push({
      type: 'include',
      value: match[1],
      lineNumber: content.substring(0, match.index).split('\n').length,
    });
  }

  for (const match of content.matchAll(JSP_TAGLIB_DIRECTIVE_PATTERN)) {
    result.imports.push({
      type: 'taglib',
      uri: match[1],
      prefix: match[2],
      value: match[0],
      lineNumber: content.substring(0, match.index).split('\n').length,
    });
  }

  for (const match of content.matchAll(JSP_DECLARATION_PATTERN)) {
    result.declarations.push({
      type: 'declaration',
      content: match[1].trim(),
      lineNumber: content.substring(0, match.index).split('\n').length,
      ast: null,
    });
  }

  for (const match of content.matchAll(JSP_SCRIPTLET_PATTERN)) {
    const beforeContent = content.substring(0, match.index);
    const lineNumber = beforeContent.split('\n').length;

    const scriptletContent = match[1];
    if (!scriptletContent.trim().startsWith('@') && scriptletContent.trim() !== '') {
      result.scriptlets.push({
        type: 'scriptlet',
        content: scriptletContent,
        lineNumber,
        ast: null,
      });
    }
  }

  for (const match of content.matchAll(JSP_EXPRESSION_PATTERN)) {
    result.expressions.push({
      type: 'expression',
      content: match[1].trim(),
      lineNumber: content.substring(0, match.index).split('\n').length,
      ast: null,
    });
  }

  for (const match of content.matchAll(JSP_EL_PATTERN)) {
    result.elExpressions.push(match[1]);
  }

  for (const match of content.matchAll(HTML_FORM_PATTERN)) {
    const beforeContent = content.substring(0, match.index);
    result.htmlElements.push({
      tag: 'form',
      attributes: { action: match[1] },
      lineNumber: beforeContent.split('\n').length,
    });
  }

  for (const match of content.matchAll(HTML_ANCHOR_PATTERN)) {
    const beforeContent = content.substring(0, match.index);
    const href = match[1];
    if (href && !href.startsWith('#') && !href.startsWith('javascript:')) {
      result.htmlElements.push({
        tag: 'a',
        attributes: { href },
        lineNumber: beforeContent.split('\n').length,
      });
    }
  }

  for (const match of content.matchAll(HTML_SCRIPT_PATTERN)) {
    const beforeContent = content.substring(0, match.index);
    result.htmlElements.push({
      tag: 'script',
      attributes: { src: match[1] },
      lineNumber: beforeContent.split('\n').length,
    });
  }

  for (const match of content.matchAll(HTML_LINK_PATTERN)) {
    const beforeContent = content.substring(0, match.index);
    result.htmlElements.push({
      tag: 'link',
      attributes: { href: match[1] },
      lineNumber: beforeContent.split('\n').length,
    });
  }

  return result;
}

interface ExtractedCall {
  caller: string;
  callee: string;
  type: 'static' | 'instance' | 'new';
  line: number;
}

interface ExtractedImport {
  imported: string;
  line: number;
}

function extractJavaCalls(code: string): ExtractedCall[] {
  const calls: ExtractedCall[] = [];
  const lines = code.split('\n');

  const newPattern = /\bnew\s+([A-Z][a-zA-Z0-9_]*(?:\.[A-Z][a-zA-Z0-9_]*)*)\s*\(/g;
  for (const match of code.matchAll(newPattern)) {
    calls.push({
      caller: '',
      callee: match[1],
      type: 'new',
      line: 0,
    });
  }

  const methodCallPattern = /\b((?:[a-zA-Z_][a-zA-Z0-9_]*\.)*[a-zA-Z_][a-zA-Z0-9_]*)\s*\.\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g;
  for (const match of code.matchAll(methodCallPattern)) {
    const receiver = match[1];
    const methodName = match[2];

    if (receiver && methodName && !['if', 'while', 'for', 'switch', 'catch', 'try', 'throw', 'return', 'class', 'interface', 'enum'].includes(methodName)) {
      calls.push({
        caller: receiver,
        callee: methodName,
        type: receiver.includes('.') ? 'instance' : 'static',
        line: 0,
      });
    }
  }

  const staticCallPattern = /\b([A-Z][a-zA-Z0-9_]*(?:\.[A-Z][a-zA-Z0-9_]*)*)\s*\.\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g;
  for (const match of code.matchAll(staticCallPattern)) {
    const className = match[1];
    const methodName = match[2];

    if (!['new', 'class', 'interface', 'enum', 'extends', 'implements', 'import', 'package'].includes(className)) {
      calls.push({
        caller: className,
        callee: methodName,
        type: 'static',
        line: 0,
      });
    }
  }

  return calls;
}

export function analyzeJspCalls(jsp: JspFile): {
  imports: ExtractedImport[];
  calls: ExtractedCall[];
} {
  const imports: ExtractedImport[] = [];
  const calls: ExtractedCall[] = [];

  for (const imp of jsp.imports) {
    if (imp.type === 'page' || imp.type === 'include') {
      imports.push({
        imported: imp.value,
        line: imp.lineNumber,
      });
    }
  }

  for (const declaration of jsp.declarations) {
    const declarationCalls = extractJavaCalls(declaration.content);
    for (const call of declarationCalls) {
      call.line = declaration.lineNumber;
      calls.push(call);
    }
  }

  for (const scriptlet of jsp.scriptlets) {
    const scriptletCalls = extractJavaCalls(scriptlet.content);
    for (const call of scriptletCalls) {
      call.line = scriptlet.lineNumber;
      calls.push(call);
    }
  }

  for (const expression of jsp.expressions) {
    const expressionCalls = extractJavaCalls(expression.content);
    for (const call of expressionCalls) {
      call.line = expression.lineNumber;
      calls.push(call);
    }
  }

  return { imports, calls };
}

export function buildJspGraph(
  jsp: JspFile,
  options?: { generateRouteNodes?: boolean }
): { nodes: GraphNode[]; relationships: GraphRelationship[] } {
  const nodes: GraphNode[] = [];
  const relationships: GraphRelationship[] = [];

  const fileId = generateId('File', jsp.path);

  nodes.push({
    id: fileId,
    label: 'File' as NodeLabel,
    properties: {
      name: jsp.path.split('/').pop() || jsp.path,
      filePath: jsp.path,
      startLine: 0,
      endLine: 0,
      isExported: true,
      description: `JSP file with ${jsp.imports.length} imports, ${jsp.scriptlets.length} scriptlets`,
    },
  } as unknown as GraphNode);

  const importedClasses: Set<string> = new Set();
  for (const imp of jsp.imports) {
    if (imp.type === 'page' && imp.value) {
      let className = imp.value;
      if (!className.includes('.')) {
        className = `javax.servlet.jsp.*.${className}`;
      }
      importedClasses.add(className);

      const importNodeId = generateId('Class', `${jsp.path}:${imp.value}`);
      relationships.push({
        id: generateId('IMPORTS', `${fileId}->${importNodeId}`),
        sourceId: fileId,
        targetId: importNodeId,
        type: 'IMPORTS',
        confidence: 0.9,
        reason: 'jsp_import',
      });
    }
  }

  const scriptletBlocks: string[] = [];
  for (const scriptlet of jsp.scriptlets) {
    scriptletBlocks.push(scriptlet.content);
  }

  if (scriptletBlocks.length > 0) {
    const combinedScriptlet = scriptletBlocks.join('\n');
    const scriptletNodeId = generateId('Function', `${jsp.path}:_jsp_scriptlet`);
    nodes.push({
      id: scriptletNodeId,
      label: 'Function' as NodeLabel,
      properties: {
        name: '_jsp_scriptlet',
        filePath: jsp.path,
        startLine: jsp.scriptlets[0]?.lineNumber || 0,
        endLine: jsp.scriptlets[jsp.scriptlets.length - 1]?.lineNumber || 0,
        isExported: false,
        description: 'Inline JSP scriptlet code',
      },
    } as unknown as GraphNode);

    relationships.push({
      id: generateId('DEFINES', `${fileId}->${scriptletNodeId}`),
      sourceId: fileId,
      targetId: scriptletNodeId,
      type: 'DEFINES',
      confidence: 1.0,
      reason: 'jsp_scriptlet',
    });

    const { calls } = analyzeJspCalls(jsp);
    for (const call of calls) {
      let targetClass = call.caller;
      if (!targetClass && importedClasses.size > 0) {
        targetClass = [...importedClasses][0];
      }

      if (targetClass) {
        const targetId = generateId('Class', `${jsp.path}:${targetClass}`);

        relationships.push({
          id: generateId('CALLS', `${scriptletNodeId}->${targetId}`),
          sourceId: scriptletNodeId,
          targetId,
          type: 'CALLS',
          confidence: call.type === 'new' ? 0.9 : 0.7,
          reason: `jsp_${call.type}_call`,
        });
      }
    }
  }

  if (options?.generateRouteNodes) {
    for (const element of jsp.htmlElements) {
      if (element.tag === 'form' && element.attributes.action) {
        const routeId = generateId('Route', element.attributes.action);
        nodes.push({
          id: routeId,
          label: 'Route' as NodeLabel,
          properties: {
            name: element.attributes.action,
            filePath: jsp.path,
            startLine: element.lineNumber,
            endLine: element.lineNumber,
            isExported: true,
          },
        } as unknown as GraphNode);

        relationships.push({
          id: generateId('HANDLES_ROUTE', `${fileId}->${routeId}`),
          sourceId: fileId,
          targetId: routeId,
          type: 'HANDLES_ROUTE',
          confidence: 0.8,
          reason: 'jsp_form_action',
        });
      }
    }
  }

  return { nodes, relationships };
}
