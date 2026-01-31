// ============================================
// Visoic Shader API - Test Suite Types
// ============================================

/**
 * Result of a single shader compilation test
 */
export interface ShaderTestResult {
  shaderId: string;
  shaderName: string;
  category: string;
  status: 'success' | 'error' | 'fixed' | 'skipped';
  error?: string;
  errorLine?: number;
  errorColumn?: number;
  fixAttempts?: number;
  fixApplied?: string;
  wgslOutput?: string;
  duration: number;
  timestamp: number;
}

/**
 * Overall test suite result
 */
export interface ShaderTestSuiteResult {
  totalShaders: number;
  passed: number;
  failed: number;
  fixed: number;
  skipped: number;
  results: ShaderTestResult[];
  startTime: number;
  endTime: number;
  duration: number;
}

/**
 * Test progress update
 */
export interface ShaderTestProgress {
  current: number;
  total: number;
  currentShaderId: string;
  currentShaderName: string;
  status: 'testing' | 'fixing' | 'complete';
  lastResult?: ShaderTestResult;
}

/**
 * Shader fix suggestion from error analysis
 */
export interface ShaderFixSuggestion {
  errorPattern: RegExp | string;
  description: string;
  fix: (source: string, error: string) => string | null;
}

/**
 * IPC message types for shader testing
 */
export type ShaderTestIPCMessage =
  | { type: 'start-test'; payload: { shaderIds?: string[] } }
  | { type: 'stop-test' }
  | { type: 'test-progress'; payload: ShaderTestProgress }
  | { type: 'test-result'; payload: ShaderTestResult }
  | { type: 'test-complete'; payload: ShaderTestSuiteResult }
  | { type: 'request-status' }
  | { type: 'status-response'; payload: { isRunning: boolean; progress?: ShaderTestProgress } }
  | { type: 'get-last-error'; payload: { shaderId: string } }
  | { type: 'last-error-response'; payload: { shaderId: string; error?: string; wgsl?: string } }
  | { type: 'retry-shader'; payload: { shaderId: string } }
  | { type: 'apply-fix'; payload: { shaderId: string; fixDescription: string } };

/**
 * Test configuration options
 */
export interface ShaderTestConfig {
  /** Whether to attempt automatic fixes for errors */
  autoFix: boolean;
  /** Maximum fix attempts per shader */
  maxFixAttempts: number;
  /** Whether to stop on first error */
  stopOnError: boolean;
  /** Filter shaders by category */
  categories?: string[];
  /** Specific shader IDs to test */
  shaderIds?: string[];
  /** Whether to include WGSL output in results */
  includeWgslOutput: boolean;
  /** Timeout per shader in milliseconds */
  timeoutMs: number;
}

/**
 * Default test configuration
 */
export const DEFAULT_TEST_CONFIG: ShaderTestConfig = {
  autoFix: true,
  maxFixAttempts: 3,
  stopOnError: false,
  includeWgslOutput: true,
  timeoutMs: 5000,
};
