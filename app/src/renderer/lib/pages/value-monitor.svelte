<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import {
    valueManager,
    audioBridge,
    type AnyValueDefinition,
    type NumberValueDefinition,
    type AccumulatorWrapMode,
  } from "$lib/api/values";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import { Slider } from "$lib/components/ui/slider";
  import { Switch } from "$lib/components/ui/switch";
  import * as Select from "$lib/components/ui/select";
  import * as Tooltip from "$lib/components/ui/tooltip";
  import * as Tabs from "$lib/components/ui/tabs";
  import { toast } from "svelte-sonner";
  import {
    Plus,
    Trash2,
    Calculator,
    Eye,
    Code,
    RefreshCw,
    HelpCircle,
    Clock,
    Zap,
    RotateCcw,
    ChevronDown,
    ChevronUp,
    Wand2,
  } from "@lucide/svelte";

  // Function categories for organization
  const functionCategories = {
    math: {
      label: "Math",
      functions: [
        {
          name: "abs",
          usage: "abs(x)",
          desc: "Absolute value",
          template: "abs($1)",
        },
        {
          name: "floor",
          usage: "floor(x)",
          desc: "Round down",
          template: "floor($1)",
        },
        {
          name: "ceil",
          usage: "ceil(x)",
          desc: "Round up",
          template: "ceil($1)",
        },
        {
          name: "round",
          usage: "round(x)",
          desc: "Round to nearest",
          template: "round($1)",
        },
        {
          name: "min",
          usage: "min(a, b)",
          desc: "Minimum value",
          template: "min($1, $2)",
        },
        {
          name: "max",
          usage: "max(a, b)",
          desc: "Maximum value",
          template: "max($1, $2)",
        },
        {
          name: "pow",
          usage: "pow(x, y)",
          desc: "x to the power of y",
          template: "pow($1, $2)",
        },
        {
          name: "sqrt",
          usage: "sqrt(x)",
          desc: "Square root",
          template: "sqrt($1)",
        },
        {
          name: "log",
          usage: "log(x)",
          desc: "Natural logarithm",
          template: "log($1)",
        },
        { name: "exp", usage: "exp(x)", desc: "e^x", template: "exp($1)" },
        {
          name: "sign",
          usage: "sign(x)",
          desc: "Returns -1, 0, or 1",
          template: "sign($1)",
        },
        {
          name: "mod",
          usage: "mod(x, y)",
          desc: "Modulo (always positive)",
          template: "mod($1, $2)",
        },
      ],
    },
    trig: {
      label: "Trigonometry",
      functions: [
        {
          name: "sin",
          usage: "sin(x)",
          desc: "Sine (radians)",
          template: "sin($1)",
        },
        {
          name: "cos",
          usage: "cos(x)",
          desc: "Cosine (radians)",
          template: "cos($1)",
        },
        {
          name: "tan",
          usage: "tan(x)",
          desc: "Tangent (radians)",
          template: "tan($1)",
        },
        {
          name: "degrees",
          usage: "degrees(rad)",
          desc: "Convert radians to degrees",
          template: "degrees($1)",
        },
        {
          name: "radians",
          usage: "radians(deg)",
          desc: "Convert degrees to radians",
          template: "radians($1)",
        },
      ],
    },
    interpolation: {
      label: "Interpolation",
      functions: [
        {
          name: "clamp",
          usage: "clamp(x, min, max)",
          desc: "Clamp value between min and max",
          template: "clamp($1, 0, 1)",
        },
        {
          name: "lerp",
          usage: "lerp(a, b, t)",
          desc: "Linear interpolation (t: 0-1)",
          template: "lerp($1, $2, $3)",
        },
        {
          name: "mix",
          usage: "mix(a, b, t)",
          desc: "Mix two values (alias for lerp)",
          template: "mix($1, $2, $3)",
        },
        {
          name: "map",
          usage: "map(x, inMin, inMax, outMin, outMax)",
          desc: "Map value from one range to another",
          template: "map($1, 0, 1, 0, 100)",
        },
        {
          name: "remap",
          usage: "remap(x, inMin, inMax, outMin, outMax)",
          desc: "Remap value (alias for map)",
          template: "remap($1, 0, 1, 0, 100)",
        },
        {
          name: "smoothstep",
          usage: "smoothstep(edge0, edge1, x)",
          desc: "Smooth Hermite interpolation",
          template: "smoothstep(0, 1, $1)",
        },
        {
          name: "step",
          usage: "step(edge, x)",
          desc: "Returns 0 if x < edge, else 1",
          template: "step(0.5, $1)",
        },
        {
          name: "saturate",
          usage: "saturate(x)",
          desc: "Clamp to 0-1",
          template: "saturate($1)",
        },
      ],
    },
    wave: {
      label: "Wave & Oscillation",
      functions: [
        {
          name: "fract",
          usage: "fract(x)",
          desc: "Fractional part of x",
          template: "fract($1)",
        },
        {
          name: "pingpong",
          usage: "pingpong(t, len)",
          desc: "Ping-pong oscillation",
          template: "pingpong(time, 1)",
        },
        {
          name: "repeat",
          usage: "repeat(t, len)",
          desc: "Repeat/wrap value",
          template: "repeat(time, 1)",
        },
        {
          name: "pulse",
          usage: "pulse(x, width)",
          desc: "Pulse wave (0 or 1)",
          template: "pulse(time, 0.5)",
        },
        {
          name: "triangle",
          usage: "triangle(x)",
          desc: "Triangle wave (0-1)",
          template: "triangle(time)",
        },
        {
          name: "sawtooth",
          usage: "sawtooth(x)",
          desc: "Sawtooth wave (0-1)",
          template: "sawtooth(time)",
        },
        {
          name: "square",
          usage: "square(x)",
          desc: "Square wave (0 or 1)",
          template: "square(time)",
        },
        {
          name: "noise",
          usage: "noise(x)",
          desc: "Deterministic noise 0-1",
          template: "noise(time)",
        },
      ],
    },
    easing: {
      label: "Easing",
      functions: [
        {
          name: "easeIn",
          usage: "easeIn(t)",
          desc: "Quadratic ease in",
          template: "easeIn($1)",
        },
        {
          name: "easeOut",
          usage: "easeOut(t)",
          desc: "Quadratic ease out",
          template: "easeOut($1)",
        },
        {
          name: "easeInOut",
          usage: "easeInOut(t)",
          desc: "Quadratic ease in-out",
          template: "easeInOut($1)",
        },
      ],
    },
    utility: {
      label: "Utility",
      functions: [
        {
          name: "quantize",
          usage: "quantize(x, steps)",
          desc: "Quantize to N steps",
          template: "quantize($1, 8)",
        },
        {
          name: "deadzone",
          usage: "deadzone(x, zone)",
          desc: "Zero out values in deadzone",
          template: "deadzone($1, 0.1)",
        },
      ],
    },
  };

  // System variables available in expressions
  const systemVariables = {
    time: {
      label: "Time",
      vars: [
        { name: "time", desc: "Seconds since start", example: "sin(time * 2)" },
        {
          name: "delta",
          desc: "Delta time in seconds",
          example: "value + rate * delta",
        },
        {
          name: "deltaMs",
          desc: "Delta time in milliseconds",
          example: "deltaMs",
        },
        { name: "frame", desc: "Frame counter", example: "mod(frame, 60)" },
        { name: "now", desc: "Unix timestamp (ms)", example: "now" },
      ],
    },
    date: {
      label: "Date & Clock",
      vars: [
        { name: "year", desc: "Current year", example: "year" },
        { name: "month", desc: "Month (1-12)", example: "month" },
        { name: "day", desc: "Day of month (1-31)", example: "day" },
        { name: "hour", desc: "Hour (0-23)", example: "hour / 24" },
        { name: "minute", desc: "Minute (0-59)", example: "minute / 60" },
        { name: "second", desc: "Second (0-59)", example: "second / 60" },
        {
          name: "millisecond",
          desc: "Millisecond (0-999)",
          example: "millisecond / 1000",
        },
        { name: "dayOfWeek", desc: "Day of week (0-6)", example: "dayOfWeek" },
        {
          name: "dayOfYear",
          desc: "Day of year (1-365)",
          example: "dayOfYear / 365",
        },
      ],
    },
    fractions: {
      label: "Time Fractions",
      vars: [
        { name: "hourFrac", desc: "Hour as 0-1 over day", example: "hourFrac" },
        {
          name: "minuteFrac",
          desc: "Minute as 0-1 over hour",
          example: "minuteFrac",
        },
        {
          name: "secondFrac",
          desc: "Second as 0-1 over minute",
          example: "secondFrac",
        },
      ],
    },
    constants: {
      label: "Constants",
      vars: [
        { name: "PI", desc: "π (3.14159...)", example: "sin(time * PI)" },
        { name: "TAU", desc: "2π (6.28318...)", example: "sin(time * TAU)" },
        { name: "E", desc: "Euler's number", example: "E" },
        { name: "PHI", desc: "Golden ratio (1.618...)", example: "PHI" },
        {
          name: "random",
          desc: "Random 0-1 (per frame)",
          example: "random * 0.1",
        },
      ],
    },
  };

  // Flatten for reference
  const expressionFunctions = Object.values(functionCategories).flatMap(
    (cat) => cat.functions,
  );

  // All values
  let values = $state<AnyValueDefinition[]>([]);
  let liveValues = $state<Record<string, unknown>>({});

  // Computed value form
  let computedForm = $state({
    id: "",
    name: "",
    expression: "",
  });

  // Accumulator value form
  let accumulatorForm = $state({
    id: "",
    name: "",
    rateExpression: "1",
    limitExpression: "",
    minExpression: "0",
    wrapMode: "none" as AccumulatorWrapMode,
    initialValue: 0,
    resetOnLimit: false,
  });

  // Expression builder state
  let builderExpression = $state("");
  let builderTarget = $state<"computed" | "rate" | "limit" | "min">("computed");
  let showBuilder = $state(false);
  let expandedCategories = $state<Set<string>>(new Set(["math", "time"]));

  // Active tab
  let activeTab = $state<string>("computed");

  // Filter
  let filterSource = $state<string>("all");
  let filterCategory = $state<string>("");
  let searchQuery = $state<string>("");

  let updateInterval: ReturnType<typeof setInterval> | null = null;
  let unsubAdd: (() => void) | null = null;
  let unsubRemove: (() => void) | null = null;

  onMount(() => {
    // Ensure audioBridge is initialized (restores config)
    audioBridge.initialize().then(() => {
      refreshValues();
    });

    refreshValues();

    // Live value updates
    updateInterval = setInterval(() => {
      const newLive: Record<string, unknown> = {};
      for (const v of values) {
        newLive[v.id] = valueManager.get(v.id);
      }
      liveValues = newLive;

      // Also update accumulators
      valueManager.updateAccumulators();
    }, 50);

    // Listen to value changes
    unsubAdd = valueManager.on("add", refreshValues);
    unsubRemove = valueManager.on("remove", refreshValues);

    return () => {
      if (updateInterval) clearInterval(updateInterval);
      if (unsubAdd) unsubAdd();
      if (unsubRemove) unsubRemove();
    };
  });

  function refreshValues() {
    values = valueManager.getAllDefinitions();
  }

  function createComputedValue() {
    if (!computedForm.id.trim()) {
      toast.error("Please enter a value ID");
      return;
    }

    if (!computedForm.expression.trim()) {
      toast.error("Please enter an expression");
      return;
    }

    try {
      valueManager.createComputed(
        computedForm.id,
        computedForm.name || computedForm.id,
        computedForm.expression,
      );

      toast.success(`Computed value "${computedForm.id}" created`);
      refreshValues();

      computedForm = {
        id: "",
        name: "",
        expression: "",
      };
    } catch (error) {
      toast.error("Failed to create computed value: " + error);
    }
  }

  function createAccumulatorValue() {
    if (!accumulatorForm.id.trim()) {
      toast.error("Please enter a value ID");
      return;
    }

    if (!accumulatorForm.rateExpression.trim()) {
      toast.error("Please enter a rate expression");
      return;
    }

    try {
      valueManager.createAccumulator(
        accumulatorForm.id,
        accumulatorForm.name || accumulatorForm.id,
        accumulatorForm.rateExpression,
        {
          limitExpression: accumulatorForm.limitExpression || undefined,
          minExpression: accumulatorForm.minExpression || undefined,
          wrapMode: accumulatorForm.wrapMode,
          initialValue: accumulatorForm.initialValue,
          resetOnLimit: accumulatorForm.resetOnLimit,
        },
      );

      toast.success(`Accumulator value "${accumulatorForm.id}" created`);
      refreshValues();

      accumulatorForm = {
        id: "",
        name: "",
        rateExpression: "1",
        limitExpression: "",
        minExpression: "0",
        wrapMode: "none",
        initialValue: 0,
        resetOnLimit: false,
      };
    } catch (error) {
      toast.error("Failed to create accumulator: " + error);
    }
  }

  // Expression builder helpers
  function insertToBuilder(text: string) {
    builderExpression += text;
  }

  function insertFunction(fn: { template: string }) {
    // Replace $1, $2, etc. with placeholders
    const expr = fn.template.replace(/\$\d/g, "_");
    builderExpression += expr;
  }

  function insertVariable(varName: string) {
    builderExpression += varName;
  }

  function insertValue(valueId: string) {
    // Convert dot notation to underscore for expression
    const underscoreName = valueId.replace(/\./g, "_");
    builderExpression += underscoreName;
  }

  function applyBuilderExpression() {
    switch (builderTarget) {
      case "computed":
        computedForm.expression = builderExpression;
        break;
      case "rate":
        accumulatorForm.rateExpression = builderExpression;
        break;
      case "limit":
        accumulatorForm.limitExpression = builderExpression;
        break;
      case "min":
        accumulatorForm.minExpression = builderExpression;
        break;
    }
    builderExpression = "";
    showBuilder = false;
    toast.success("Expression applied");
  }

  function openBuilder(target: "computed" | "rate" | "limit" | "min") {
    builderTarget = target;
    switch (target) {
      case "computed":
        builderExpression = computedForm.expression;
        break;
      case "rate":
        builderExpression = accumulatorForm.rateExpression;
        break;
      case "limit":
        builderExpression = accumulatorForm.limitExpression;
        break;
      case "min":
        builderExpression = accumulatorForm.minExpression;
        break;
    }
    showBuilder = true;
  }

  function toggleCategory(catKey: string) {
    if (expandedCategories.has(catKey)) {
      expandedCategories.delete(catKey);
    } else {
      expandedCategories.add(catKey);
    }
    expandedCategories = new Set(expandedCategories);
  }

  function removeValue(id: string) {
    valueManager.unregister(id);
    toast.success("Value removed");
    refreshValues();
  }

  function resetValue(id: string) {
    valueManager.reset(id);
    toast.success("Value reset to default");
  }

  // Filtered values using $derived instead of $effect to avoid infinite loop
  let filteredValues = $derived.by(() => {
    let filtered = values;

    if (filterSource !== "all") {
      filtered = filtered.filter((v) => v.source.type === filterSource);
    }

    if (filterCategory) {
      filtered = filtered.filter((v) => v.category === filterCategory);
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (v) =>
          v.id.toLowerCase().includes(q) || v.name.toLowerCase().includes(q),
      );
    }

    return filtered;
  });

  function formatValue(value: unknown, def: AnyValueDefinition): string {
    if (value === undefined || value === null) return "-";

    if (def.type === "number") {
      const numDef = def as NumberValueDefinition;
      const precision = numDef.precision ?? 3;
      const num = Number(value);
      const formatted = num.toFixed(precision);
      return numDef.unit ? `${formatted} ${numDef.unit}` : formatted;
    }

    if (def.type === "boolean") {
      return value ? "true" : "false";
    }

    if (def.type === "array") {
      return `[${(value as unknown[]).length} items]`;
    }

    return String(value);
  }

  function getSourceBadgeClass(sourceType: string): string {
    switch (sourceType) {
      case "audio":
        return "bg-blue-500/20 text-blue-400";
      case "computed":
        return "bg-purple-500/20 text-purple-400";
      case "accumulator":
        return "bg-orange-500/20 text-orange-400";
      case "manual":
        return "bg-green-500/20 text-green-400";
      case "system":
        return "bg-yellow-500/20 text-yellow-400";
      default:
        return "bg-white/10 text-white/60";
    }
  }

  // Get unique categories
  let categories = $derived([
    ...new Set(values.map((v) => v.category).filter(Boolean)),
  ]);

  // Wrap modes for accumulator
  const wrapModes: {
    value: AccumulatorWrapMode;
    label: string;
    desc: string;
  }[] = [
    { value: "none", label: "None", desc: "No limiting, accumulates forever" },
    {
      value: "wrap",
      label: "Wrap (Modulo)",
      desc: "value % limit - loops back to start",
    },
    { value: "clamp", label: "Clamp", desc: "Stops at min/max limits" },
    {
      value: "pingpong",
      label: "Ping-Pong",
      desc: "Bounces between min and max",
    },
  ];
</script>

<div class="w-full h-full p-6 overflow-auto">
  <div class="max-w-6xl mx-auto space-y-8">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold">Value Monitor</h1>
        <p class="text-white/60 text-sm mt-1">
          View and manage all reactive values
        </p>
      </div>
      <Button variant="outline" size="sm" onclick={refreshValues}>
        <RefreshCw class="size-4 mr-2" />
        Refresh
      </Button>
    </div>

    <!-- Create Value Section with Tabs -->
    <section class="bg-white/5 rounded-lg p-6 border border-white/10">
      <Tabs.Root bind:value={activeTab}>
        <Tabs.List class="mb-6">
          <Tabs.Trigger value="computed" class="flex items-center gap-2">
            <Calculator class="size-4" />
            Computed Value
          </Tabs.Trigger>
          <Tabs.Trigger value="accumulator" class="flex items-center gap-2">
            <Clock class="size-4" />
            Accumulator Value
          </Tabs.Trigger>
        </Tabs.List>

        <!-- Computed Value Tab -->
        <Tabs.Content value="computed">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div class="space-y-2">
              <Label>Value ID *</Label>
              <Input
                bind:value={computedForm.id}
                placeholder="e.g., computed.bassAvg"
              />
            </div>

            <div class="space-y-2">
              <Label>Display Name</Label>
              <Input
                bind:value={computedForm.name}
                placeholder="e.g., Bass Average"
              />
            </div>

            <div class="space-y-2 md:col-span-2">
              <div class="flex items-center justify-between">
                <Label>Expression *</Label>
                <Button
                  variant="ghost"
                  size="sm"
                  onclick={() => openBuilder("computed")}
                >
                  <Wand2 class="size-4 mr-1" />
                  Builder
                </Button>
              </div>
              <Input
                bind:value={computedForm.expression}
                placeholder="e.g., (audio_bass + audio_mid) / 2"
                class="font-mono"
              />
              <p class="text-xs text-white/40 mt-1">
                Dependencies are auto-detected from expression. Use underscore
                notation (audio_bass) or system vars (time, PI, etc.)
              </p>
              {#if values.length > 0}
                <div class="flex flex-wrap gap-1 mt-2">
                  <span class="text-xs text-white/40 mr-1"
                    >Available values:</span
                  >
                  {#each values.slice(0, 10) as v}
                    <button
                      type="button"
                      class="px-1.5 py-0.5 text-xs bg-blue-500/20 text-blue-400 rounded hover:bg-blue-500/30 transition-colors font-mono"
                      onclick={() => {
                        const varName = v.id.replace(/\./g, "_");
                        computedForm.expression += computedForm.expression
                          ? ` + ${varName}`
                          : varName;
                      }}
                    >
                      {v.id}
                    </button>
                  {/each}
                  {#if values.length > 10}
                    <span class="text-xs text-white/40"
                      >+{values.length - 10} more</span
                    >
                  {/if}
                </div>
              {/if}
            </div>
          </div>

          <div class="mt-6 flex justify-end">
            <Button
              onclick={createComputedValue}
              disabled={!computedForm.id.trim() ||
                !computedForm.expression.trim()}
            >
              <Plus class="size-4 mr-2" />
              Create Computed
            </Button>
          </div>
        </Tabs.Content>

        <!-- Accumulator Value Tab -->
        <Tabs.Content value="accumulator">
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div class="space-y-2">
              <Label>Value ID *</Label>
              <Input
                bind:value={accumulatorForm.id}
                placeholder="e.g., acc.rotation"
              />
            </div>

            <div class="space-y-2">
              <Label>Display Name</Label>
              <Input
                bind:value={accumulatorForm.name}
                placeholder="e.g., Rotation Angle"
              />
            </div>

            <div class="space-y-2">
              <Label>Initial Value</Label>
              <Input
                type="number"
                bind:value={accumulatorForm.initialValue}
                step={0.1}
              />
            </div>

            <div class="space-y-2">
              <div class="flex items-center justify-between">
                <Label>Rate Expression * (per second)</Label>
                <Button
                  variant="ghost"
                  size="sm"
                  onclick={() => openBuilder("rate")}
                >
                  <Wand2 class="size-3" />
                </Button>
              </div>
              <Input
                bind:value={accumulatorForm.rateExpression}
                placeholder="e.g., 1 or audio_bass * 10"
                class="font-mono"
              />
              <p class="text-xs text-white/40">
                Rate of change per second. Dependencies auto-detected.
              </p>
            </div>

            <div class="space-y-2">
              <Label>Wrap Mode</Label>
              <Select.Root type="single" bind:value={accumulatorForm.wrapMode}>
                <Select.Trigger class="w-full">
                  {wrapModes.find((m) => m.value === accumulatorForm.wrapMode)
                    ?.label || "Select mode"}
                </Select.Trigger>
                <Select.Content>
                  {#each wrapModes as mode}
                    <Select.Item value={mode.value} label={mode.label}>
                      <div>
                        <div>{mode.label}</div>
                        <div class="text-xs text-white/50">{mode.desc}</div>
                      </div>
                    </Select.Item>
                  {/each}
                </Select.Content>
              </Select.Root>
            </div>

            {#if accumulatorForm.wrapMode !== "none"}
              <div class="space-y-2">
                <div class="flex items-center justify-between">
                  <Label>Min Expression</Label>
                  <Button
                    variant="ghost"
                    size="sm"
                    onclick={() => openBuilder("min")}
                  >
                    <Wand2 class="size-3" />
                  </Button>
                </div>
                <Input
                  bind:value={accumulatorForm.minExpression}
                  placeholder="e.g., 0"
                  class="font-mono"
                />
              </div>

              <div class="space-y-2">
                <div class="flex items-center justify-between">
                  <Label>Limit Expression (Max)</Label>
                  <Button
                    variant="ghost"
                    size="sm"
                    onclick={() => openBuilder("limit")}
                  >
                    <Wand2 class="size-3" />
                  </Button>
                </div>
                <Input
                  bind:value={accumulatorForm.limitExpression}
                  placeholder="e.g., 360 or TAU"
                  class="font-mono"
                />
                <p class="text-xs text-white/40">
                  For wrap: value = value % limit. Dependencies auto-detected.
                </p>
              </div>
            {/if}

            {#if accumulatorForm.wrapMode === "none"}
              <div class="space-y-2 flex items-center gap-3">
                <Switch
                  id="resetOnLimit"
                  bind:checked={accumulatorForm.resetOnLimit}
                />
                <Label for="resetOnLimit">Reset on limit reached</Label>
              </div>
            {/if}
          </div>

          <div class="mt-6 flex justify-end">
            <Button
              onclick={createAccumulatorValue}
              disabled={!accumulatorForm.id.trim() ||
                !accumulatorForm.rateExpression.trim()}
            >
              <Plus class="size-4 mr-2" />
              Create Accumulator
            </Button>
          </div>
        </Tabs.Content>
      </Tabs.Root>
    </section>

    <!-- Expression Builder Modal -->
    {#if showBuilder}
      <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions a11y_interactive_supports_focus -->
      <div
        class="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
        role="dialog"
        aria-modal="true"
        tabindex="-1"
        onclick={() => (showBuilder = false)}
      >
        <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions a11y_no_static_element_interactions -->
        <div
          class="bg-zinc-900 rounded-lg border border-white/10 w-full max-w-4xl max-h-[80vh] overflow-hidden"
          role="presentation"
          onclick={(e) => e.stopPropagation()}
        >
          <div
            class="p-4 border-b border-white/10 flex items-center justify-between"
          >
            <h3 class="text-lg font-semibold flex items-center gap-2">
              <Wand2 class="size-5" />
              Expression Builder
            </h3>
            <Button
              variant="ghost"
              size="sm"
              onclick={() => (showBuilder = false)}>×</Button
            >
          </div>

          <div class="p-4 space-y-4">
            <!-- Current Expression -->
            <div class="space-y-2">
              <Label>Expression</Label>
              <div class="flex gap-2">
                <Input
                  bind:value={builderExpression}
                  class="font-mono flex-1"
                  placeholder="Build your expression..."
                />
                <Button
                  variant="outline"
                  size="sm"
                  onclick={() => (builderExpression = "")}
                >
                  <RotateCcw class="size-4" />
                </Button>
              </div>
            </div>

            <!-- Quick Insert Buttons -->
            <div class="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onclick={() => insertToBuilder(" + ")}>+</Button
              >
              <Button
                variant="outline"
                size="sm"
                onclick={() => insertToBuilder(" - ")}>−</Button
              >
              <Button
                variant="outline"
                size="sm"
                onclick={() => insertToBuilder(" * ")}>×</Button
              >
              <Button
                variant="outline"
                size="sm"
                onclick={() => insertToBuilder(" / ")}>÷</Button
              >
              <Button
                variant="outline"
                size="sm"
                onclick={() => insertToBuilder("(")}>( )</Button
              >
              <Button
                variant="outline"
                size="sm"
                onclick={() => insertToBuilder(")")}>)</Button
              >
              <Button
                variant="outline"
                size="sm"
                onclick={() => insertToBuilder(" % ")}>%</Button
              >
              <Button
                variant="outline"
                size="sm"
                onclick={() => insertToBuilder(" ? : ")}
              >
                ? :</Button
              >
            </div>

            <div
              class="grid grid-cols-1 lg:grid-cols-2 gap-4 max-h-[40vh] overflow-auto"
            >
              <!-- Functions Panel -->
              <div class="space-y-2">
                <h4 class="font-medium text-sm text-white/70">Functions</h4>
                <div class="space-y-1">
                  {#each Object.entries(functionCategories) as [key, cat]}
                    <div class="border border-white/10 rounded">
                      <button
                        type="button"
                        class="w-full px-3 py-2 flex items-center justify-between hover:bg-white/5 transition-colors"
                        onclick={() => toggleCategory(key)}
                      >
                        <span class="font-medium text-sm">{cat.label}</span>
                        {#if expandedCategories.has(key)}
                          <ChevronUp class="size-4" />
                        {:else}
                          <ChevronDown class="size-4" />
                        {/if}
                      </button>
                      {#if expandedCategories.has(key)}
                        <div class="px-3 pb-2 flex flex-wrap gap-1">
                          {#each cat.functions as fn}
                            <Tooltip.Provider>
                              <Tooltip.Root>
                                <Tooltip.Trigger>
                                  <button
                                    type="button"
                                    class="px-2 py-1 text-xs bg-purple-500/20 text-purple-400 rounded hover:bg-purple-500/30 transition-colors font-mono"
                                    onclick={() => insertFunction(fn)}
                                  >
                                    {fn.name}
                                  </button>
                                </Tooltip.Trigger>
                                <Tooltip.Content>
                                  <div class="text-sm">
                                    <div
                                      class="font-mono font-semibold text-purple-400"
                                    >
                                      {fn.usage}
                                    </div>
                                    <div class="text-black/80 mt-1">
                                      {fn.desc}
                                    </div>
                                  </div>
                                </Tooltip.Content>
                              </Tooltip.Root>
                            </Tooltip.Provider>
                          {/each}
                        </div>
                      {/if}
                    </div>
                  {/each}
                </div>
              </div>

              <!-- Variables Panel -->
              <div class="space-y-2">
                <h4 class="font-medium text-sm text-white/70">
                  System Variables
                </h4>
                <div class="space-y-1">
                  {#each Object.entries(systemVariables) as [key, cat]}
                    <div class="border border-white/10 rounded">
                      <button
                        type="button"
                        class="w-full px-3 py-2 flex items-center justify-between hover:bg-white/5 transition-colors"
                        onclick={() => toggleCategory(key)}
                      >
                        <span class="font-medium text-sm">{cat.label}</span>
                        {#if expandedCategories.has(key)}
                          <ChevronUp class="size-4" />
                        {:else}
                          <ChevronDown class="size-4" />
                        {/if}
                      </button>
                      {#if expandedCategories.has(key)}
                        <div class="px-3 pb-2 flex flex-wrap gap-1">
                          {#each cat.vars as v}
                            <Tooltip.Provider>
                              <Tooltip.Root>
                                <Tooltip.Trigger>
                                  <button
                                    type="button"
                                    class="px-2 py-1 text-xs bg-yellow-500/20 text-yellow-400 rounded hover:bg-yellow-500/30 transition-colors font-mono"
                                    onclick={() => insertVariable(v.name)}
                                  >
                                    {v.name}
                                  </button>
                                </Tooltip.Trigger>
                                <Tooltip.Content>
                                  <div class="text-sm">
                                    <div class="font-semibold text-yellow-400">
                                      {v.desc}
                                    </div>
                                    <div class="text-black/60 mt-1 font-mono">
                                      {v.example}
                                    </div>
                                  </div>
                                </Tooltip.Content>
                              </Tooltip.Root>
                            </Tooltip.Provider>
                          {/each}
                        </div>
                      {/if}
                    </div>
                  {/each}
                </div>

                <!-- Available Values -->
                {#if values.length > 0}
                  <h4 class="font-medium text-sm text-white/70 mt-4">
                    Available Values
                  </h4>
                  <div
                    class="border border-white/10 rounded p-3 max-h-32 overflow-auto"
                  >
                    <div class="flex flex-wrap gap-1">
                      {#each values as v}
                        <button
                          type="button"
                          class="px-2 py-1 text-xs bg-blue-500/20 text-blue-400 rounded hover:bg-blue-500/30 transition-colors font-mono"
                          onclick={() => insertValue(v.id)}
                        >
                          {v.id}
                        </button>
                      {/each}
                    </div>
                  </div>
                {/if}
              </div>
            </div>
          </div>

          <div class="p-4 border-t border-white/10 flex justify-end gap-2">
            <Button variant="outline" onclick={() => (showBuilder = false)}
              >Cancel</Button
            >
            <Button onclick={applyBuilderExpression}>
              <Zap class="size-4 mr-2" />
              Apply Expression
            </Button>
          </div>
        </div>
      </div>
    {/if}

    <!-- Filters -->
    <div class="flex flex-wrap gap-4 items-end">
      <div class="space-y-1">
        <Label class="text-xs">Source Type</Label>
        <Select.Root type="single" bind:value={filterSource}>
          <Select.Trigger class="w-40">
            {filterSource === "all"
              ? "All Sources"
              : filterSource.charAt(0).toUpperCase() + filterSource.slice(1)}
          </Select.Trigger>
          <Select.Content>
            <Select.Item value="all" label="All Sources" />
            <Select.Item value="audio" label="Audio" />
            <Select.Item value="computed" label="Computed" />
            <Select.Item value="accumulator" label="Accumulator" />
            <Select.Item value="manual" label="Manual" />
            <Select.Item value="system" label="System" />
          </Select.Content>
        </Select.Root>
      </div>

      {#if categories.length > 0}
        <div class="space-y-1">
          <Label class="text-xs">Category</Label>
          <Select.Root type="single" bind:value={filterCategory}>
            <Select.Trigger class="w-40">
              {filterCategory || "All Categories"}
            </Select.Trigger>
            <Select.Content>
              <Select.Item value="" label="All Categories" />
              {#each categories as cat}
                <Select.Item value={cat} label={cat} />
              {/each}
            </Select.Content>
          </Select.Root>
        </div>
      {/if}

      <div class="space-y-1 flex-1 min-w-48">
        <Label class="text-xs">Search</Label>
        <Input bind:value={searchQuery} placeholder="Search values..." />
      </div>
    </div>

    <!-- Values Table -->
    <section
      class="bg-white/5 rounded-lg border border-white/10 overflow-hidden"
    >
      <div class="p-4 border-b border-white/10 flex items-center gap-2">
        <Eye class="size-5" />
        <h2 class="text-lg font-semibold">All Values</h2>
        <span class="text-sm text-white/50">({filteredValues.length})</span>
      </div>

      {#if filteredValues.length === 0}
        <div class="text-center py-12 text-white/60">
          <p>No values registered</p>
          <p class="text-sm mt-2">
            Create bindings or computed values to see them here
          </p>
        </div>
      {:else}
        <div class="overflow-x-auto">
          <table class="w-full">
            <thead class="bg-white/5">
              <tr class="text-left text-sm text-white/70">
                <th class="px-4 py-3 font-medium">ID</th>
                <th class="px-4 py-3 font-medium">Name</th>
                <th class="px-4 py-3 font-medium">Value</th>
                <th class="px-4 py-3 font-medium">Type</th>
                <th class="px-4 py-3 font-medium">Source</th>
                <th class="px-4 py-3 font-medium w-24">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-white/5">
              {#each filteredValues as valueDef}
                <tr class="hover:bg-white/5 transition-colors">
                  <td class="px-4 py-3 font-mono text-sm text-blue-400"
                    >{valueDef.id}</td
                  >
                  <td class="px-4 py-3 text-sm">{valueDef.name}</td>
                  <td class="px-4 py-3">
                    <div class="flex items-center gap-2">
                      {#if valueDef.type === "number"}
                        <div
                          class="w-16 h-2 bg-white/10 rounded overflow-hidden"
                        >
                          <div
                            class="h-full bg-blue-500 transition-all duration-75"
                            style="width: {Math.min(
                              100,
                              Math.max(
                                0,
                                ((liveValues[valueDef.id] as number) ?? 0) *
                                  100,
                              ),
                            )}%"
                          ></div>
                        </div>
                      {/if}
                      <span class="font-mono text-sm">
                        {formatValue(liveValues[valueDef.id], valueDef)}
                      </span>
                    </div>
                  </td>
                  <td class="px-4 py-3">
                    <span class="px-2 py-1 rounded text-xs bg-white/10"
                      >{valueDef.type}</span
                    >
                  </td>
                  <td class="px-4 py-3">
                    <span
                      class="px-2 py-1 rounded text-xs {getSourceBadgeClass(
                        valueDef.source.type,
                      )}"
                    >
                      {valueDef.source.type}
                    </span>
                  </td>
                  <td class="px-4 py-3">
                    <div class="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onclick={() => resetValue(valueDef.id)}
                        title="Reset to default"
                      >
                        <RefreshCw class="size-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onclick={() => removeValue(valueDef.id)}
                        title="Remove"
                      >
                        <Trash2 class="size-3 text-red-400" />
                      </Button>
                    </div>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    </section>

    <!-- Stats -->
    <div class="grid grid-cols-2 md:grid-cols-5 gap-4">
      <div class="bg-white/5 rounded-lg p-4 border border-white/10">
        <div class="text-2xl font-bold">{values.length}</div>
        <div class="text-sm text-white/50">Total Values</div>
      </div>
      <div class="bg-white/5 rounded-lg p-4 border border-white/10">
        <div class="text-2xl font-bold text-blue-400">
          {values.filter((v) => v.source.type === "audio").length}
        </div>
        <div class="text-sm text-white/50">Audio Values</div>
      </div>
      <div class="bg-white/5 rounded-lg p-4 border border-white/10">
        <div class="text-2xl font-bold text-purple-400">
          {values.filter((v) => v.source.type === "computed").length}
        </div>
        <div class="text-sm text-white/50">Computed Values</div>
      </div>
      <div class="bg-white/5 rounded-lg p-4 border border-white/10">
        <div class="text-2xl font-bold text-orange-400">
          {values.filter((v) => v.source.type === "accumulator").length}
        </div>
        <div class="text-sm text-white/50">Accumulators</div>
      </div>
      <div class="bg-white/5 rounded-lg p-4 border border-white/10">
        <div class="text-2xl font-bold text-green-400">
          {categories.length}
        </div>
        <div class="text-sm text-white/50">Categories</div>
      </div>
    </div>
  </div>
</div>
