import { useState } from 'react';
import {
  Search,
  Play,
  RotateCcw,
  AlertTriangle,
  CheckCircle2,
  GitBranch,
  Layers,
  ShieldAlert,
  Target,
  Zap,
  FileWarning,
  ChevronDown,
  Loader2,
  ArrowRight,
} from '@/lib/lucide-icons';
import { useVulnerabilityTracker, TrackerViewMode } from '../hooks/useVulnerabilityTracker';
import { MermaidDiagram } from '../components/MermaidDiagram';
import { KnowledgeGraph } from '../core/graph/types';
import { SinkCategory } from '../core/security/types';
import { getSinkCategoryColor } from '../core/security/path-visualizer';

interface UploadTrackerPageProps {
  graph: KnowledgeGraph | null;
  runQuery?: (cypher: string) => Promise<any[]>;
  onBack?: () => void;
}

export const UploadTrackerPage = ({ graph, runQuery, onBack }: UploadTrackerPageProps) => {
  const {
    sources,
    sinks,
    filteredSources,
    filteredSinks,
    paths,
    selectedPathIndex,
    maxPathCount,
    maxPathDepth,
    sourceFilter,
    sinkFilter,
    isAnalyzing,
    viewMode,
    error,
    mermaidDiagram,
    hasGraph,
    setViewMode,
    setMaxPathCount,
    setMaxPathDepth,
    setSourceFilter,
    setSinkFilter,
    setSelectedPathIndex,
    analyze,
    reset,
  } = useVulnerabilityTracker(graph || null, runQuery);

  const [expandedSources, setExpandedSources] = useState(true);
  const [expandedSinks, setExpandedSinks] = useState(true);

  if (!hasGraph) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8">
        <div className="w-16 h-16 mb-4 flex items-center justify-center bg-surface rounded-2xl">
          <ShieldAlert className="w-8 h-8 text-text-muted" />
        </div>
        <h2 className="text-xl font-semibold text-text-primary mb-2">No Project Loaded</h2>
        <p className="text-sm text-text-secondary text-center max-w-md">
          Load a project first to analyze upload vulnerability data flows.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-void">
      <div className="flex items-center justify-between px-4 py-3 bg-surface border-b border-border-subtle">
        <div className="flex items-center gap-3">
          {onBack && (
            <button
              onClick={onBack}
              className="p-2 text-text-muted hover:text-text-primary hover:bg-hover rounded-lg transition-colors"
            >
              <ArrowRight className="w-5 h-5 rotate-180" />
            </button>
          )}
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-red-400" />
            <h1 className="text-lg font-semibold text-text-primary">Upload Vulnerability Tracker</h1>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={reset}
            className="flex items-center gap-2 px-3 py-1.5 text-sm text-text-secondary hover:text-text-primary hover:bg-hover rounded-lg transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            Reset
          </button>
          <button
            onClick={analyze}
            disabled={isAnalyzing || filteredSources.length === 0 || filteredSinks.length === 0}
            className="flex items-center gap-2 px-4 py-1.5 bg-accent hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
          >
            {isAnalyzing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                Analyze Paths
              </>
            )}
          </button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        <div className="w-80 border-r border-border-subtle bg-surface flex flex-col overflow-hidden">
          <div className="border-b border-border-subtle">
            <button
              onClick={() => setExpandedSources(!expandedSources)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-hover transition-colors"
            >
              <div className="flex items-center gap-2">
                <Target className="w-4 h-4 text-green-400" />
                <span className="text-sm font-medium text-text-primary">
                  Sources ({filteredSources.length})
                </span>
              </div>
              <ChevronDown className={`w-4 h-4 text-text-muted transition-transform ${expandedSources ? '' : '-rotate-90'}`} />
            </button>

            {expandedSources && (
              <div className="px-4 pb-3">
                <div className="relative mb-2">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                  <input
                    type="text"
                    value={sourceFilter}
                    onChange={(e) => setSourceFilter(e.target.value)}
                    placeholder="Filter sources..."
                    className="w-full pl-9 pr-3 py-2 bg-elevated border border-border-subtle rounded-lg text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
                  />
                </div>

                <div className="max-h-40 overflow-y-auto space-y-1">
                  {filteredSources.length === 0 ? (
                    <p className="text-xs text-text-muted py-2">No sources found</p>
                  ) : (
                    filteredSources.slice(0, 10).map((source) => (
                      <div
                        key={source.id}
                        className="px-2 py-1.5 bg-elevated/50 rounded text-xs"
                      >
                        <span className="text-green-400 font-mono">{source.methodName}</span>
                        <span className="text-text-muted ml-2 truncate block">{source.filePath}</span>
                      </div>
                    ))
                  )}
                  {filteredSources.length > 10 && (
                    <p className="text-xs text-text-muted py-1">+{filteredSources.length - 10} more...</p>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="border-b border-border-subtle">
            <button
              onClick={() => setExpandedSinks(!expandedSinks)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-hover transition-colors"
            >
              <div className="flex items-center gap-2">
                <FileWarning className="w-4 h-4 text-red-400" />
                <span className="text-sm font-medium text-text-primary">
                  Sinks ({filteredSinks.length})
                </span>
              </div>
              <ChevronDown className={`w-4 h-4 text-text-muted transition-transform ${expandedSinks ? '' : '-rotate-90'}`} />
            </button>

            {expandedSinks && (
              <div className="px-4 pb-3">
                <div className="relative mb-2">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                  <input
                    type="text"
                    value={sinkFilter}
                    onChange={(e) => setSinkFilter(e.target.value)}
                    placeholder="Filter sinks..."
                    className="w-full pl-9 pr-3 py-2 bg-elevated border border-border-subtle rounded-lg text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
                  />
                </div>

                <div className="max-h-40 overflow-y-auto space-y-1">
                  {filteredSinks.length === 0 ? (
                    <p className="text-xs text-text-muted py-2">No sinks found</p>
                  ) : (
                    filteredSinks.slice(0, 10).map((sink) => (
                      <div
                        key={sink.id}
                        className="px-2 py-1.5 bg-elevated/50 rounded text-xs"
                      >
                        <span
                          className="font-mono"
                          style={{ color: getSinkCategoryColor(sink.category) }}
                        >
                          {sink.methodName}
                        </span>
                        <span className="text-text-muted ml-2 truncate block text-[10px]">
                          {sink.category.replace('_', ' ')}
                        </span>
                      </div>
                    ))
                  )}
                  {filteredSinks.length > 10 && (
                    <p className="text-xs text-text-muted py-1">+{filteredSinks.length - 10} more...</p>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="px-4 py-3 space-y-3">
            <div>
              <label className="block text-xs text-text-muted mb-1.5">Max Paths</label>
              <select
                value={maxPathCount}
                onChange={(e) => setMaxPathCount(Number(e.target.value))}
                className="w-full px-3 py-2 bg-elevated border border-border-subtle rounded-lg text-sm text-text-primary focus:outline-none focus:border-accent"
              >
                {[1, 2, 3, 5, 10].map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs text-text-muted mb-1.5">Max Depth</label>
              <select
                value={maxPathDepth}
                onChange={(e) => setMaxPathDepth(Number(e.target.value))}
                className="w-full px-3 py-2 bg-elevated border border-border-subtle rounded-lg text-sm text-text-primary focus:outline-none focus:border-accent"
              >
                {[1, 2, 3, 5, 7, 10].map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-auto px-4 py-3 border-t border-border-subtle">
            {error ? (
              <div className="flex items-center gap-2 text-red-400 text-xs">
                <AlertTriangle className="w-4 h-4" />
                {error}
              </div>
            ) : paths.length > 0 ? (
              <div className="flex items-center gap-2 text-green-400 text-xs">
                <CheckCircle2 className="w-4 h-4" />
                Found {paths.length} path{paths.length !== 1 ? 's' : ''}
              </div>
            ) : (
              <div className="text-xs text-text-muted">
                {filteredSources.length} sources, {filteredSinks.length} sinks
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex items-center justify-between px-4 py-2 bg-surface/50 border-b border-border-subtle">
            <div className="flex items-center gap-1 bg-elevated rounded-lg p-1">
              <button
                onClick={() => setViewMode('mermaid')}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                  viewMode === 'mermaid'
                    ? 'bg-accent text-white'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                <Layers className="w-4 h-4 inline mr-1.5" />
                Mermaid
              </button>
              <button
                onClick={() => setViewMode('graph')}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                  viewMode === 'graph'
                    ? 'bg-accent text-white'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                <GitBranch className="w-4 h-4 inline mr-1.5" />
                Graph
              </button>
            </div>

            {paths.length > 0 && (
              <div className="flex items-center gap-2 text-sm text-text-secondary">
                <span>Path:</span>
                <select
                  value={selectedPathIndex}
                  onChange={(e) => setSelectedPathIndex(Number(e.target.value))}
                  className="px-2 py-1 bg-elevated border border-border-subtle rounded text-text-primary"
                >
                  {paths.map((_, idx) => (
                    <option key={idx} value={idx}>{idx + 1}</option>
                  ))}
                </select>
                <span>of {paths.length}</span>
              </div>
            )}
          </div>

          <div className="flex-1 overflow-auto p-4">
            {paths.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <div className="w-16 h-16 mb-4 flex items-center justify-center bg-surface rounded-2xl">
                  <Zap className="w-8 h-8 text-text-muted" />
                </div>
                <h3 className="text-base font-medium text-text-primary mb-2">
                  {isAnalyzing ? 'Analyzing...' : 'No Paths Found'}
                </h3>
                <p className="text-sm text-text-secondary max-w-md">
                  {isAnalyzing
                    ? 'Tracing data flows from sources to sinks...'
                    : 'Click "Analyze Paths" to discover vulnerability paths.'}
                </p>
              </div>
            ) : viewMode === 'mermaid' ? (
              <div className="h-full">
                <MermaidDiagram code={mermaidDiagram} />
              </div>
            ) : (
              <div className="flex flex-col h-full">
                <div className="mb-4 p-4 bg-surface border border-border-subtle rounded-xl">
                  <h3 className="text-sm font-medium text-text-primary mb-2">
                    Path {selectedPathIndex + 1} of {paths.length}
                  </h3>
                  <div className="space-y-2">
                    {paths[selectedPathIndex]?.nodes.map((node, idx) => (
                      <div key={node.id} className="flex items-center gap-2">
                        {idx > 0 && (
                          <div className="ml-4 w-0.5 h-4 bg-border-subtle" />
                        )}
                        <div
                          className={`px-3 py-2 rounded-lg text-sm ${
                            node.type === 'source'
                              ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                              : node.type === 'sink'
                              ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                              : 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
                          }`}
                        >
                          <span className="font-mono">{node.methodName}</span>
                          <span className="text-text-muted ml-2 text-xs">
                            {node.filePath.split('/').pop()}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
