# Requirements Document - Java Binary Indexing

## Introduction

本需求文档定义 GitNexus 对 Java 二进制文件（JAR、CLASS、JSP）的索引和调用关系分析功能。

## Glossary

- **JAR (Java Archive)**: 包含多个 Java class 文件和资源的 ZIP 压缩包格式
- **Class File (Java Bytecode)**: Java 编译器输出的二进制文件，包含 JVM 可执行的字节码指令
- **JSP (JavaServer Pages)**: HTML 中嵌入 Java 代码的模板文件
- **Bytecode Analysis**: 对 Java 字节码的完整解析，包括常量池、字段表、方法表、属性表
- **Call Graph**: 代码元素之间的调用关系图

## Requirements

### REQ-001: JAR 文件索引

**User Story:** 作为 GitNexus 用户，我希望系统能够索引 JAR 文件的内部结构，以便我能够理解大型 Java 项目的依赖关系和类组织。

#### Acceptance Criteria

1. WHEN 用户对包含 JAR 文件的目录运行索引命令，THEN 系统 SHALL 自动解压每个 JAR 文件并解析其内部结构。

2. WHEN JAR 文件被解析，THEN 系统 SHALL 提取以下信息并创建节点：
   - JAR 文件本身的 File 节点
   - JAR 内部每个 class 文件的 Class/Interface 节点
   - JAR 的 MANIFEST.MF 中的依赖信息（Class-Path）

3. WHEN JAR 内部 class 被解析，THEN 系统 SHALL 建立 CONTAINS 关系从 JAR 指向其内部的 class 节点。

4. WHEN JAR 文件引用其他 JAR（通过 Class-Path），THEN 系统 SHALL 建立 IMPORTS 关系。

---

### REQ-002: Class 字节码完整解析

**User Story:** 作为 GitNexus 用户，我希望系统能够完整解析 Java class 文件的字节码，以便我能够追踪方法调用和字段引用。

#### Acceptance Criteria

1. WHEN 系统解析 class 文件，THEN 系统 SHALL 提取并创建以下节点：
   - Class 节点（包含包名、类名、访问修饰符）
   - 对于每个方法：Method 节点（方法名、描述符、参数类型、返回类型）
   - 对于每个字段：Field/Property 节点（字段名、类型、修饰符）
   - 对于每个内部类：嵌套的 Class 节点

2. WHEN 系统解析 class 文件，THEN 系统 SHALL 提取并创建以下关系：
   - EXTENDS 关系：指向父类
   - IMPLEMENTS 关系：指向实现的接口
   - HAS_METHOD 关系：从 Class 指向 Method
   - HAS_PROPERTY 关系：从 Class 指向 Field

3. WHEN 系统解析方法字节码，THEN 系统 SHALL 分析以下字节码指令并建立 CALLS 关系：
   - `invokevirtual`：实例方法调用
   - `invokespecial`：构造器、私有方法、父类方法调用
   - `invokestatic`：静态方法调用
   - `invokeinterface`：接口方法调用

4. WHEN 系统解析方法字节码，THEN 系统 SHALL 分析以下指令并建立 ACCESSES 关系：
   - `getfield` / `putfield`：实例字段访问
   - `getstatic` / `putstatic`：静态字段访问

5. WHEN 系统遇到动态调用（`invokedynamic`），THEN 系统 SHALL 记录调用目标为动态绑定并降低置信度。

6. WHEN class 引用其他 class（通过常量池），THEN 系统 SHALL 建立 IMPORTS 关系。

---

### REQ-003: JSP 文件完整解析

**User Story:** 作为 GitNexus 用户，我希望系统能够解析 JSP 文件中的 Java 代码和 HTML 结构，以便我能够理解 Web 应用的页面逻辑。

#### Acceptance Criteria

1. WHEN 系统解析 JSP 文件，THEN 系统 SHALL 提取并创建以下节点：
   - File 节点（JSP 文件本身）
   - 嵌入的 Java 代码片段（scriptlet、expression、declaration）作为 Function/Method 节点

2. WHEN 系统解析 JSP 文件，THEN 系统 SHALL 提取以下 HTML 元素：
   - `<form>` 标签的 `action` 属性作为 Route 引用
   - `<a>` 标签的 `href` 属性作为资源引用
   - `<script>` 和 `<link>` 标签的 `src`/`href` 属性作为资源引用

3. WHEN 系统解析 JSP 中的 import 语句（`<%@ page import="..." %>`、`<%@ taglib uri="..." %>`），THEN 系统 SHALL 建立 IMPORTS 关系。

4. WHEN 系统解析 JSP 中的 Java 代码片段，THEN 系统 SHALL 分析：
   - `new` 表达式：建立 CALLS 关系指向构造器
   - 方法调用：建立 CALLS 关系指向被调用的方法
   - 字段访问：建立 ACCESSES 关系

5. WHEN JSP 中的 Java 代码片段引用编译后的 class 文件或 JAR 中的类，THEN 系统 SHALL 建立跨文件的 IMPORTS/CALLS 关系。

---

### REQ-004: 统一的调用关系图

**User Story:** 作为 GitNexus 用户，我希望系统能够将 JAR、class、JSP 以及现有源码的调用关系统一到同一个知识图谱中。

#### Acceptance Criteria

1. WHEN 系统索引包含 JAR、class、JSP 和源码的混合项目，THEN 系统 SHALL 将所有元素的 CALLS、IMPORTS、EXTENDS 等关系统一存储到同一个知识图谱中。

2. WHEN 用户查询某个方法的调用链，THEN 系统 SHALL 返回跨越 JAR/class/JSP 边界的完整调用路径。

3. WHEN 用户查询某个类的依赖，THEN 系统 SHALL 返回该类在源码、JAR、class 文件中的所有引用。

---

### REQ-005: 索引配置和性能

**User Story:** 作为 GitNexus 用户，我希望能够配置索引行为以平衡功能和性能。

#### Acceptance Criteria

1. WHEN 用户配置索引选项，THEN 系统 SHALL 支持以下配置：
   - 是否解析 JAR 内部结构（默认启用）
   - 是否进行完整的字节码分析（默认启用）
   - 最大 JAR 文件大小限制（默认 100MB）
   - 是否递归解析嵌套 JAR（默认禁用）

2. WHEN 系统处理超大 JAR 文件（>100MB），THEN 系统 SHALL 记录警告日志并允许用户通过配置覆盖。

3. WHEN 系统解析 JAR 内部的 class 文件，THEN 系统 SHALL 使用流式解压以避免内存溢出。

---

### REQ-006: 错误处理和容错

**User Story:** 作为 GitNexus 用户，我希望系统在遇到损坏或无法解析的文件时能够继续处理其他文件。

#### Acceptance Criteria

1. WHEN 系统遇到损坏的 JAR 文件，THEN 系统 SHALL 记录错误日志并继续处理其他文件。

2. WHEN 系统遇到无法解析的 class 文件（版本不支持、格式错误），THEN 系统 SHALL 创建包含错误信息的节点并继续处理。

3. WHEN 系统遇到包含无效 Java 代码的 JSP 文件，THEN 系统 SHALL 记录解析错误并尽可能提取 HTML 结构信息。

---

### REQ-007: 忽略服务和配置

**User Story:** 作为 GitNexus 管理员，我希望能够通过 ignore-service 配置哪些二进制文件应该被索引。

#### Acceptance Criteria

1. WHEN 用户未明确配置，二进制文件 SHALL 默认被忽略以保持向后兼容。

2. WHEN 用户在配置中显式启用 `.jar`、`.class`、`.jsp` 的索引选项，THEN 系统 SHALL 根据 REQ-001 到 REQ-003 的规则处理这些文件。

3. WHEN 用户在 ignore-service 中添加自定义模式，二级制文件的索引规则 SHALL 与 ignore-service 联动。

