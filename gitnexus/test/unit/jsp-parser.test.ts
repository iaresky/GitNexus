import { describe, it, expect } from 'vitest';
import { parseJsp, analyzeJspCalls, buildJspGraph } from '../../src/core/ingestion/jsp-parser.js';
import { setBinaryIndexingConfig, getBinaryIndexingConfig } from '../../src/config/binary-indexing-config.js';

describe('JSP Parser', () => {
  describe('parseJsp', () => {
    it('should parse simple JSP file', () => {
      const content = `<%@ page language="java" import="java.util.List" %>
<html>
<body>
    <% String msg = "Hello"; %>
    <p><%= msg %></p>
</body>
</html>`;

      const result = parseJsp(content, 'test.jsp');

      expect(result.path).toBe('test.jsp');
      expect(result.imports).toHaveLength(1);
      expect(result.imports[0].type).toBe('page');
      expect(result.imports[0].value).toBe('java.util.List');
    });

    it('should extract scriptlets', () => {
      const content = `<%
    String name = "Test";
    int age = 25;
%>`;

      const result = parseJsp(content, 'test.jsp');

      expect(result.scriptlets).toHaveLength(1);
      expect(result.scriptlets[0].content).toContain('String name');
    });

    it('should extract expressions', () => {
      const content = `<html>
<p><%= request.getParameter("name") %></p>
<p><%= 1 + 2 %></p>
</html>`;

      const result = parseJsp(content, 'test.jsp');

      expect(result.expressions).toHaveLength(2);
      expect(result.expressions[0].content).toContain('request.getParameter');
    });

    it('should extract declarations', () => {
      const content = `<%!
    private String appName = "MyApp";
    public String getName() { return appName; }
%>`;

      const result = parseJsp(content, 'test.jsp');

      expect(result.declarations).toHaveLength(1);
      expect(result.declarations[0].type).toBe('declaration');
    });

    it('should extract HTML form actions', () => {
      const content = `<html>
<form action="/submit" method="post">
    <input type="text" name="username"/>
</form>
<a href="/home">Home</a>
</html>`;

      const result = parseJsp(content, 'test.jsp');

      expect(result.htmlElements).toHaveLength(2);
      expect(result.htmlElements.find(e => e.tag === 'form')?.attributes.action).toBe('/submit');
    });

    it('should extract EL expressions', () => {
      const content = `<html>
<p>User: ${user.name}</p>
<p>Count: ${count + 1}</p>
</html>`;

      const result = parseJsp(content, 'test.jsp');

      expect(result.elExpressions).toHaveLength(2);
      expect(result.elExpressions).toContain('user.name');
    });
  });

  describe('analyzeJspCalls', () => {
    it('should detect method calls in scriptlets', () => {
      const content = `<%
    List<String> list = new ArrayList<>();
    list.add("item");
    String size = String.valueOf(list.size());
%>`;

      const jsp = parseJsp(content, 'test.jsp');
      const { calls } = analyzeJspCalls(jsp);

      expect(calls.length).toBeGreaterThan(0);
    });

    it('should detect new object creation', () => {
      const content = `<%
    Date date = new Date();
    Calendar cal = Calendar.getInstance();
%>`;

      const jsp = parseJsp(content, 'test.jsp');
      const { calls } = analyzeJspCalls(jsp);

      const newCalls = calls.filter(c => c.type === 'new');
      expect(newCalls.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('buildJspGraph', () => {
    it('should create File node', () => {
      const content = `<html><body><% int x = 1; %></body></html>`;
      const jsp = parseJsp(content, 'test.jsp');
      const { nodes } = buildJspGraph(jsp);

      expect(nodes.some(n => n.label === 'File')).toBe(true);
    });

    it('should create IMPORTS relationships for page imports', () => {
      const content = `<%@ page import="java.util.List" %>
<html><body></body></html>`;
      const jsp = parseJsp(content, 'test.jsp');
      const { relationships } = buildJspGraph(jsp);

      expect(relationships.some(r => r.type === 'IMPORTS')).toBe(true);
    });

    it('should create Route nodes for form actions when option enabled', () => {
      const content = `<html>
<form action="/submit" method="post">
    <input type="submit"/>
</form>
</html>`;
      const jsp = parseJsp(content, 'test.jsp');
      const { nodes } = buildJspGraph(jsp, { generateRouteNodes: true });

      expect(nodes.some(n => n.label === 'Route' && n.properties.name === '/submit')).toBe(true);
    });
  });
});

describe('Binary Indexing Config', () => {
  it('should have default config disabled', () => {
    const config = getBinaryIndexingConfig();
    expect(config.enabled).toBe(false);
    expect(config.indexJar).toBe(false);
    expect(config.indexClass).toBe(false);
    expect(config.indexJsp).toBe(false);
  });

  it('should update config', () => {
    setBinaryIndexingConfig({
      enabled: true,
      indexJsp: true,
    });

    const config = getBinaryIndexingConfig();
    expect(config.enabled).toBe(true);
    expect(config.indexJsp).toBe(true);
  });
});
