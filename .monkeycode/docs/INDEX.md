# GitNexus Web Documentation

## Overview

GitNexus Web is a browser-based code analysis tool that helps developers understand, navigate, and query codebases through interactive knowledge graphs and AI-powered search.

## Documentation Structure

- [ARCHITECTURE.md](./ARCHITECTURE.md) - System architecture and design
- [INTERFACES.md](./INTERFACES.md) - Type definitions and interfaces
- [DEVELOPER_GUIDE.md](./DEVELOPER_GUIDE.md) - Development guidelines

## Modules

### Core Modules

- **Graph Engine** (`src/core/graph/`) - Knowledge graph representation and manipulation
- **Ingestion Pipeline** (`src/core/ingestion/`) - Code parsing and analysis pipeline
- **LLM Agent** (`src/core/llm/`) - AI-powered code query system
- **Search** (`src/core/search/`) - Hybrid search (BM25 + semantic)
- **Security Analysis** (`src/core/security/`) - Upload vulnerability tracker

### Security Analysis

The Upload Vulnerability Tracker (`src/core/security/`) provides:

- **Source Detection**: Identifies file upload entry points via Java annotations and keywords
- **Sink Detection**: Identifies dangerous file handling methods
- **Path Discovery**: Traces data flow from sources to sinks
- **Visualization**: Mermaid flowchart and graph highlighting

### Components

- **UploadTrackerPage** (`src/pages/UploadTrackerPage.tsx`) - Security analysis UI
- **GraphCanvas** (`src/components/GraphCanvas.tsx`) - Interactive graph visualization
- **MermaidDiagram** (`src/components/MermaidDiagram.tsx`) - Flowchart rendering

## Technology Stack

- React 18 + TypeScript
- Vite for bundling
- TailwindCSS for styling
- LadybugDB (WASM) for graph database
- Sigma.js for graph rendering
- Mermaid for diagrams
- LangChain for LLM integration
