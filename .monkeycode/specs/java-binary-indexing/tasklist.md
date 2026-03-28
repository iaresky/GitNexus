# 需求实施计划 - Java Binary Indexing

- [x] 1. 创建字节码解析核心模块
  - [x] 1.1 创建 `bytecode-parser.ts` 模块文件
    - 定义 BytecodeParser 接口和 ClassFile 数据结构
    - 实现常量池标签枚举和入口点
    - 参考: design.md 第 78-124 行

  - [x] 1.2 实现 class 文件头部解析
    - 验证 magic number (0xCAFEBABE)
    - 解析 version (major/minor)
    - 解析 access_flags、this_class、super_class
    - 参考: REQ-002, design.md 第 282-300 行

  - [x] 1.3 实现常量池解析
    - 实现所有 11 种常量池条目类型解析
    - 实现 CONSTANT_Class、Methodref、Fieldref 解析
    - 实现 NameAndType 解析
    - 参考: design.md 第 238-263 行

  - [x] 1.4 实现字段表和方法表解析
    - 解析 field_info 结构
    - 解析 method_info 结构
    - 解析属性表 (attributes)
    - 参考: REQ-002 第 1 条

  - [x] 1.5 实现方法字节码分析
    - 实现字节码指令解码器
    - 分析 invokevirtual/invokespecial/invokestatic/invokeinterface
    - 提取 getfield/putfield/getstatic/putstatic 访问
    - 参考: REQ-002 第 3-4 条, design.md 第 109-123 行

  - [x] 1.6 实现描述符解析工具
    - 实现 parseFieldDescriptor (字段类型)
    - 实现 parseMethodDescriptor (方法签名)
    - 实现 parseReturnType
    - 参考: design.md 第 296 行约束

  - [x] 1.7 编写字节码解析单元测试
    - 创建测试用的 class 文件 fixture
    - 测试常量池解析正确性
    - 测试方法调用关系提取

- [x] 2. 创建 JAR 分析模块
  - [x] 2.1 创建 `jar-analyzer.ts` 模块文件
    - 定义 JarAnalyzer 接口和 JarIndexOptions
    - 实现流式解压逻辑
    - 参考: design.md 第 48-76 行

  - [x] 2.2 实现 ZIP 流式解压
    - 使用 Node.js 原生 zlib 实现流式解压
    - 支持大文件处理 (最大 100MB)
    - 实现 jar 内部文件条目遍历
    - 参考: REQ-005 第 2 条

  - [x] 2.3 实现 MANIFEST.MF 解析
    - 解析 Main-Class 属性
    - 解析 Class-Path 依赖
    - 提取 JAR 元信息
    - 参考: REQ-001 第 2 条

  - [x] 2.4 实现 JAR 内 class 文件协调解析
    - 将 class 条目路由到字节码解析器
    - 建立 JAR -> class 的 CONTAINS_CLASS 关系
    - 参考: REQ-001 第 3 条, design.md 第 226-233 行

  - [x] 2.5 编写 JAR 解析单元测试
    - 创建测试用的 JAR fixture
    - 测试 MANIFEST 解析
    - 测试流式解压

- [x] 3. 创建 JSP 解析模块
  - [x] 3.1 创建 `jsp-parser.ts` 模块文件
    - 定义 JspParser 接口和 JspFile 数据结构
    - 实现 HTML/Java 代码分离逻辑
    - 参考: design.md 第 126-159 行

  - [x] 3.2 实现 HTML 结构提取
    - 提取 form action 属性
    - 提取 a/script/link 的 href/src 属性
    - 建立 Route 引用节点
    - 参考: REQ-003 第 2 条

  - [x] 3.3 实现 JSP 指令解析
    - 解析 page import 属性
    - 解析 include 指令
    - 解析 taglib uri 属性
    - 参考: REQ-003 第 3 条

  - [x] 3.4 实现 Java 代码片段提取
    - 提取 declaration (<%! %>)
    - 提取 scriptlet (<% %>)
    - 提取 expression (<%= %>)
    - 解析 EL 表达式 (${})
    - 参考: REQ-003 第 1 条

  - [x] 3.5 实现 JSP 中 Java 代码的调用分析
    - 分析 scriptlet 中的方法调用
    - 分析 expression 中的字段访问
    - 建立 CALLS 和 ACCESSES 关系
    - 参考: REQ-003 第 4 条

  - [ ]* 3.6 编写 JSP 解析单元测试
    - 创建测试用的 JSP fixture
    - 测试各类 JSP 元素提取
    - 测试 import 语句解析

- [x] 4. 集成到知识图谱
  - [x] 4.1 扩展节点类型定义
    - 添加 JarNode、BytecodeClassNode、BytecodeMethodNode 类型
    - 添加 BytecodeField 节点类型
    - 参考: design.md 第 186-224 行

  - [x] 4.2 扩展关系类型定义
    - 添加 CONTAINS_CLASS、BYTECODE_CALLS、BYTECODE_ACCESSES
    - 添加 HAS_BYTECODE_METHOD、HAS_BYTECODE_FIELD
    - 参考: design.md 第 226-233 行

  - [x] 4.3 集成到 graph builder
    - 修改现有的 graph.ts 添加二进制节点支持
    - 实现字节码符号到图节点的转换
    - 实现调用关系的统一存储
    - 参考: REQ-004

  - [x] 4.4 实现 Import Resolver 扩展
    - 添加跨 JAR 边界的解析策略
    - 实现 SameJar -> ImportedJar -> ClassPath 的分层解析
    - 参考: design.md 第 161-179 行

  - [x] 4.5 编写图谱集成测试
    - 测试 JAR 内调用关系
    - 测试跨 JAR 调用关系
    - 测试 JSP 与 class 的跨文件调用

- [x] 5. 修改忽略服务和配置
  - [x] 5.1 修改 ignore-service.ts
    - 从忽略列表移除 .class、.jar、.jsp
    - 添加可配置的二进制文件处理选项
    - 参考: REQ-007

  - [x] 5.2 添加索引选项配置
    - 添加 binaryIndexing: { enabled, maxJarSize, recursiveNested }
    - 集成到现有配置系统
    - 参考: REQ-005 第 1 条

  - [x] 5.3 实现错误处理和容错
    - 实现 ErrorNode 创建逻辑
    - 添加损坏文件的跳过逻辑
    - 实现循环依赖检测
    - 参考: design.md 第 302-328 行

- [x] 6. 集成到索引管道
  - [x] 6.1 修改 parsing-processor.ts
    - 添加 JAR/Class/JSP 文件路由逻辑
    - 协调字节码解析器和 JSP 解析器的调用
    - 参考: design.md 架构图

  - [x] 6.2 修改 filesystem-walker.ts
    - 移除对二进制文件的默认忽略
    - 添加对 .jar、.class、.jsp 的文件检测
    - 参考: REQ-001 到 REQ-003

  - [x] 6.3 修改 csv-generator.ts
    - 添加二进制节点类型的 CSV 输出支持
    - 处理 ErrorNode 的输出
    - 参考: 设计文档存储部分

  - [x] 6.4 添加导入处理器扩展
    - 支持 BytecodeClass 节点的 import 解析
    - 支持 JSP import 语句处理
    - 参考: REQ-002 第 6 条, REQ-003 第 3 条

- [x] 7. 检查点 - 确保核心功能完整
  - 确保字节码解析能提取类/方法/字段和调用关系
  - 确保 JAR 解压和内部结构解析正常工作
  - 确保 JSP 的 Java 代码提取和调用分析正常
  - 确保图谱能存储和查询二进制文件节点

- [ ] 8. 性能优化和测试
  - [x] 8.1 实现流式处理优化
    - 避免将整个 JAR 或大 class 文件加载到内存
    - 实现 LRU 缓存
    - 参考: REQ-005 第 2-3 条

  - [ ] 8.2 创建测试 fixtures
    - 创建 test/fixtures/java/ 目录
    - 添加 simple.jar、multi-class.jar 等测试文件
    - 添加 simple.class 字节码文件
    - 添加 test/fixtures/jsp/ 目录
    - 参考: design.md 第 359-374 行

  - [ ]* 8.3 运行现有测试套件
    - 确保现有功能不受影响
    - 修复任何回归问题

  - [ ]* 8.4 添加集成测试
    - 测试 JAR 内跨 class 调用
    - 测试 JSP 调用编译后的 class
    - 测试源码与 JAR 的混合调用链
