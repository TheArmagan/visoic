<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { Button } from "$lib/components/ui/button";
  import { Progress } from "$lib/components/ui/progress";
  import { Badge } from "$lib/components/ui/badge";
  import { ScrollArea } from "$lib/components/ui/scroll-area";
  import {
    Play,
    Square,
    RefreshCw,
    CheckCircle,
    XCircle,
    AlertCircle,
    Wrench,
    ChevronDown,
    ChevronRight,
    Copy,
    Trash2,
  } from "@lucide/svelte";
  import { isfLoader, isfParser, type ISFShaderInfo } from "$lib/api/shader";
  import type {
    ShaderTestResult,
    ShaderTestProgress,
    ShaderTestSuiteResult,
    ShaderTestConfig,
    DEFAULT_TEST_CONFIG,
  } from "$lib/api/shader/test-types";

  // Native API
  const native = (window as any).VISOICNative;

  // Test state
  let isRunning = $state(false);
  let progress = $state<ShaderTestProgress | null>(null);
  let results = $state<ShaderTestResult[]>([]);
  let suiteResult = $state<ShaderTestSuiteResult | null>(null);

  // Shader list
  let allShaders = $state<ISFShaderInfo[]>([]);
  let categories = $state<string[]>([]);
  let selectedCategory = $state<string | null>(null);

  // Expanded result details
  let expandedResults = $state<Set<string>>(new Set());

  // WebGPU device for compilation testing
  let gpuDevice: GPUDevice | null = null;

  // Config
  let config = $state<ShaderTestConfig>({
    autoFix: true,
    maxFixAttempts: 3,
    stopOnError: false,
    includeWgslOutput: true,
    timeoutMs: 5000,
  });

  // Stats computed
  let stats = $derived({
    total: results.length,
    passed: results.filter((r) => r.status === "success").length,
    failed: results.filter((r) => r.status === "error").length,
    fixed: results.filter((r) => r.status === "fixed").length,
    skipped: results.filter((r) => r.status === "skipped").length,
  });

  let progressPercent = $derived(
    progress ? (progress.current / progress.total) * 100 : 0,
  );

  // Initialize
  onMount(async () => {
    // Load shader list
    allShaders = await isfLoader.getAllShaders();
    categories = await isfLoader.getCategories();

    // Initialize WebGPU
    try {
      const adapter = await navigator.gpu?.requestAdapter();
      if (adapter) {
        gpuDevice = await adapter.requestDevice();
      }
    } catch (e) {
      console.error("[ShaderTest] Failed to initialize WebGPU:", e);
    }

    // Listen for CLI commands
    native.shaderTest.onStart(startTest);
    native.shaderTest.onStop(stopTest);
    native.shaderTest.onRetry(({ shaderId }: { shaderId: string }) => {
      retryShader(shaderId);
    });
  });

  onDestroy(() => {
    gpuDevice?.destroy();
  });

  // Compile a single shader and return result
  async function compileShader(
    shader: ISFShaderInfo,
  ): Promise<ShaderTestResult> {
    const startTime = performance.now();
    const result: ShaderTestResult = {
      shaderId: shader.id,
      shaderName: shader.name,
      category: shader.category,
      status: "success",
      duration: 0,
      timestamp: Date.now(),
    };

    try {
      // Load shader source
      const source = await isfLoader.loadShader(shader.id);
      if (!source) {
        result.status = "error";
        result.error = "Failed to load shader source";
        result.duration = performance.now() - startTime;
        return result;
      }

      // Parse and convert to WGSL using isfParser
      // The parse method both parses and generates WGSL
      const compileResult = isfParser.parse(
        source.fragment,
        source.vertex || undefined,
      );

      if (!compileResult.success) {
        result.status = "error";
        result.error = compileResult.error || "Unknown compile error";
        if (config.includeWgslOutput && compileResult.fragmentShader) {
          result.wgslOutput = compileResult.fragmentShader;
        }
        result.duration = performance.now() - startTime;
        return result;
      }

      // Try to create shader module with WebGPU
      if (gpuDevice && compileResult.fragmentShader) {
        try {
          const module = gpuDevice.createShaderModule({
            code: compileResult.fragmentShader,
          });

          // Check for compilation errors
          const info = await module.getCompilationInfo();
          const errors = info.messages.filter((m) => m.type === "error");

          if (errors.length > 0) {
            result.status = "error";
            result.error = errors.map((e) => e.message).join("\n");
            result.errorLine = errors[0].lineNum;
            result.errorColumn = errors[0].linePos;
            if (config.includeWgslOutput) {
              result.wgslOutput = compileResult.fragmentShader;
            }
          }
        } catch (e: any) {
          result.status = "error";
          result.error = e.message || String(e);
          if (config.includeWgslOutput) {
            result.wgslOutput = compileResult.fragmentShader;
          }
        }
      }

      if (config.includeWgslOutput && result.status === "success") {
        result.wgslOutput = compileResult.fragmentShader || undefined;
      }
    } catch (e: any) {
      result.status = "error";
      result.error = e.message || String(e);
    }

    result.duration = performance.now() - startTime;
    return result;
  }

  // Helper to create a plain serializable object for IPC
  function toSerializable<T>(obj: T): T {
    return JSON.parse(JSON.stringify(obj));
  }

  // Start test suite
  async function startTest(testConfig?: Partial<ShaderTestConfig>) {
    if (isRunning) return;

    // Merge config
    if (testConfig) {
      config = { ...config, ...testConfig };
    }

    isRunning = true;
    results = [];
    suiteResult = null;

    // Filter shaders
    let shadersToTest = allShaders;
    if (selectedCategory) {
      shadersToTest = allShaders.filter((s) => s.category === selectedCategory);
    }
    if (config.categories?.length) {
      shadersToTest = shadersToTest.filter((s) =>
        config.categories!.includes(s.category),
      );
    }
    if (config.shaderIds?.length) {
      const idSet = new Set(config.shaderIds);
      shadersToTest = shadersToTest.filter((s) => idSet.has(s.id));
    }

    const startTime = Date.now();

    for (let i = 0; i < shadersToTest.length; i++) {
      const shader = shadersToTest[i];

      // Update progress
      progress = {
        current: i + 1,
        total: shadersToTest.length,
        currentShaderId: shader.id,
        currentShaderName: shader.name,
        status: "testing",
      };
      native.shaderTest.sendProgress(toSerializable(progress));

      // Compile shader
      const result = await compileShader(shader);
      results = [...results, result];
      progress.lastResult = result;

      // Send result to main process (serialize to avoid IPC clone errors)
      native.shaderTest.sendResult(toSerializable(result));

      // Stop on error if configured
      if (config.stopOnError && result.status === "error") {
        break;
      }
    }

    // Complete
    const endTime = Date.now();
    suiteResult = {
      totalShaders: shadersToTest.length,
      passed: results.filter((r) => r.status === "success").length,
      failed: results.filter((r) => r.status === "error").length,
      fixed: results.filter((r) => r.status === "fixed").length,
      skipped: results.filter((r) => r.status === "skipped").length,
      results,
      startTime,
      endTime,
      duration: endTime - startTime,
    };

    progress = {
      current: shadersToTest.length,
      total: shadersToTest.length,
      currentShaderId: "",
      currentShaderName: "",
      status: "complete",
    };

    native.shaderTest.sendProgress(toSerializable(progress));
    native.shaderTest.sendComplete(toSerializable(suiteResult));

    isRunning = false;
  }

  // Stop test
  function stopTest() {
    isRunning = false;
  }

  // Retry a specific shader
  async function retryShader(shaderId: string) {
    const shader = allShaders.find((s) => s.id === shaderId);
    if (!shader) return;

    const result = await compileShader(shader);

    // Update results
    const idx = results.findIndex((r) => r.shaderId === shaderId);
    if (idx >= 0) {
      results = [...results.slice(0, idx), result, ...results.slice(idx + 1)];
    } else {
      results = [...results, result];
    }

    native.shaderTest.sendResult(toSerializable(result));
  }

  // Clear results
  function clearResults() {
    results = [];
    suiteResult = null;
    progress = null;
    native.shaderTest.clear();
  }

  // Toggle result expansion
  function toggleExpanded(shaderId: string) {
    const newSet = new Set(expandedResults);
    if (newSet.has(shaderId)) {
      newSet.delete(shaderId);
    } else {
      newSet.add(shaderId);
    }
    expandedResults = newSet;
  }

  // Copy error to clipboard
  async function copyError(result: ShaderTestResult) {
    const text = `Shader: ${result.shaderId}\nError: ${result.error}\n\nWGSL:\n${result.wgslOutput || "N/A"}`;
    await navigator.clipboard.writeText(text);
  }

  // Get status icon
  function getStatusIcon(status: ShaderTestResult["status"]) {
    switch (status) {
      case "success":
        return CheckCircle;
      case "error":
        return XCircle;
      case "fixed":
        return Wrench;
      case "skipped":
        return AlertCircle;
    }
  }

  // Get status color
  function getStatusColor(status: ShaderTestResult["status"]) {
    switch (status) {
      case "success":
        return "text-green-500";
      case "error":
        return "text-red-500";
      case "fixed":
        return "text-yellow-500";
      case "skipped":
        return "text-gray-500";
    }
  }
</script>

<div class="w-full h-full flex flex-col bg-zinc-950 text-white p-4 gap-4">
  <!-- Header -->
  <div class="flex items-center justify-between">
    <div class="flex items-center gap-4">
      <h1 class="text-2xl font-bold">Shader Test Suite</h1>
      <Badge variant="outline" class="text-xs">
        {allShaders.length} shaders
      </Badge>
    </div>

    <div class="flex items-center gap-2">
      {#if !isRunning}
        <Button onclick={() => startTest()} class="gap-2">
          <Play class="size-4" />
          Run Tests
        </Button>
      {:else}
        <Button onclick={stopTest} variant="destructive" class="gap-2">
          <Square class="size-4" />
          Stop
        </Button>
      {/if}
      <Button onclick={clearResults} variant="outline" class="gap-2">
        <Trash2 class="size-4" />
        Clear
      </Button>
    </div>
  </div>

  <!-- Category Filter -->
  <div class="flex items-center gap-2 flex-wrap">
    <span class="text-sm text-zinc-400">Filter:</span>
    <Button
      size="sm"
      variant={selectedCategory === null ? "secondary" : "outline"}
      onclick={() => (selectedCategory = null)}
    >
      All
    </Button>
    {#each categories as cat}
      <Button
        size="sm"
        variant={selectedCategory === cat ? "secondary" : "outline"}
        onclick={() => (selectedCategory = cat)}
      >
        {cat}
      </Button>
    {/each}
  </div>

  <!-- Progress -->
  {#if progress}
    <div
      class="flex flex-col gap-2 p-4 bg-zinc-900 rounded-lg border border-zinc-800"
    >
      <div class="flex items-center justify-between">
        <span class="text-sm text-zinc-400">
          Testing: {progress.currentShaderName}
        </span>
        <span class="text-sm">
          {progress.current} / {progress.total}
        </span>
      </div>
      <Progress value={progressPercent} class="h-2" />
    </div>
  {/if}

  <!-- Stats -->
  {#if results.length > 0}
    <div
      class="flex items-center gap-4 p-4 bg-zinc-900 rounded-lg border border-zinc-800"
    >
      <div class="flex items-center gap-2">
        <CheckCircle class="size-4 text-green-500" />
        <span class="text-sm">{stats.passed} passed</span>
      </div>
      <div class="flex items-center gap-2">
        <XCircle class="size-4 text-red-500" />
        <span class="text-sm">{stats.failed} failed</span>
      </div>
      <div class="flex items-center gap-2">
        <Wrench class="size-4 text-yellow-500" />
        <span class="text-sm">{stats.fixed} fixed</span>
      </div>
      <div class="flex items-center gap-2">
        <AlertCircle class="size-4 text-gray-500" />
        <span class="text-sm">{stats.skipped} skipped</span>
      </div>
      {#if suiteResult}
        <div class="ml-auto text-sm text-zinc-400">
          Completed in {(suiteResult.duration / 1000).toFixed(1)}s
        </div>
      {/if}
    </div>
  {/if}

  <!-- Results List -->
  <ScrollArea class="flex-1 border border-zinc-800 rounded-lg">
    <div class="flex flex-col divide-y divide-zinc-800">
      {#each results as result (result.shaderId)}
        {@const StatusIcon = getStatusIcon(result.status)}
        {@const statusColor = getStatusColor(result.status)}

        <div class="flex flex-col">
          <!-- Result Row -->
          <button
            class="flex items-center gap-4 p-3 hover:bg-zinc-900 transition-colors text-left w-full"
            onclick={() => toggleExpanded(result.shaderId)}
          >
            {#if expandedResults.has(result.shaderId)}
              <ChevronDown class="size-4 text-zinc-500" />
            {:else}
              <ChevronRight class="size-4 text-zinc-500" />
            {/if}

            <StatusIcon class="size-5 {statusColor}" />

            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2">
                <span class="font-medium truncate">{result.shaderName}</span>
                <Badge variant="outline" class="text-xs">
                  {result.category}
                </Badge>
              </div>
              {#if result.error}
                <p class="text-xs text-red-400 truncate mt-1">
                  {result.error.split("\n")[0]}
                </p>
              {/if}
            </div>

            <span class="text-xs text-zinc-500">
              {result.duration.toFixed(0)}ms
            </span>

            <Button
              size="sm"
              variant="ghost"
              onclick={(e) => {
                e.stopPropagation();
                retryShader(result.shaderId);
              }}
            >
              <RefreshCw class="size-4" />
            </Button>
          </button>

          <!-- Expanded Details -->
          {#if expandedResults.has(result.shaderId)}
            <div class="p-4 bg-zinc-900/50 border-t border-zinc-800">
              {#if result.error}
                <div class="mb-4">
                  <div class="flex items-center justify-between mb-2">
                    <span class="text-sm font-medium text-red-400">Error</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onclick={() => copyError(result)}
                    >
                      <Copy class="size-4" />
                    </Button>
                  </div>
                  <pre
                    class="text-xs bg-zinc-950 p-3 rounded border border-zinc-800 overflow-x-auto whitespace-pre-wrap text-red-300">{result.error}</pre>
                </div>
              {/if}

              {#if result.wgslOutput}
                <div>
                  <span class="text-sm font-medium text-zinc-400 block mb-2">
                    Generated WGSL
                  </span>
                  <pre
                    class="text-xs bg-zinc-950 p-3 rounded border border-zinc-800 overflow-x-auto max-h-96 text-zinc-300">{result.wgslOutput}</pre>
                </div>
              {/if}

              {#if result.errorLine}
                <div class="mt-2 text-xs text-zinc-500">
                  Error at line {result.errorLine}, column {result.errorColumn}
                </div>
              {/if}
            </div>
          {/if}
        </div>
      {/each}

      {#if results.length === 0 && !isRunning}
        <div class="p-8 text-center text-zinc-500">
          <p>No test results yet.</p>
          <p class="text-sm mt-2">
            Click "Run Tests" to start testing shaders.
          </p>
        </div>
      {/if}
    </div>
  </ScrollArea>
</div>
