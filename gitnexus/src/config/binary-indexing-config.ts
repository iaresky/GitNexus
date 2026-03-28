export interface BinaryIndexingConfig {
  enabled: boolean;
  indexJar: boolean;
  indexClass: boolean;
  indexJsp: boolean;
  maxJarSize: number;
  recursiveNestedJars: boolean;
}

export const DEFAULT_BINARY_INDEXING_CONFIG: BinaryIndexingConfig = {
  enabled: false,
  indexJar: false,
  indexClass: false,
  indexJsp: false,
  maxJarSize: 100 * 1024 * 1024,
  recursiveNestedJars: false,
};

let globalConfig: BinaryIndexingConfig = { ...DEFAULT_BINARY_INDEXING_CONFIG };

export function setBinaryIndexingConfig(config: Partial<BinaryIndexingConfig>): void {
  globalConfig = { ...globalConfig, ...config };
}

export function getBinaryIndexingConfig(): BinaryIndexingConfig {
  return { ...globalConfig };
}

export function isBinaryIndexingEnabled(): boolean {
  return globalConfig.enabled;
}

export function shouldIndexJar(): boolean {
  return globalConfig.enabled && globalConfig.indexJar;
}

export function shouldIndexClass(): boolean {
  return globalConfig.enabled && globalConfig.indexClass;
}

export function shouldIndexJsp(): boolean {
  return globalConfig.enabled && globalConfig.indexJsp;
}

export function getMaxJarSize(): number {
  return globalConfig.maxJarSize;
}

export function shouldRecursiveNestedJars(): boolean {
  return globalConfig.recursiveNestedJars;
}
