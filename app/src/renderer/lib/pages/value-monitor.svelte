<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { valueManager, audioBridge, type AnyValueDefinition, type NumberValueDefinition } from '$lib/api/values';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import * as Select from '$lib/components/ui/select';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import { toast } from 'svelte-sonner';
  import { Plus, Trash2, Calculator, Eye, Code, RefreshCw, HelpCircle } from '@lucide/svelte';

  // Available functions with descriptions
  const expressionFunctions = [
    { name: 'abs', usage: 'abs(x)', desc: 'Absolute value' },
    { name: 'floor', usage: 'floor(x)', desc: 'Round down' },
    { name: 'ceil', usage: 'ceil(x)', desc: 'Round up' },
    { name: 'round', usage: 'round(x)', desc: 'Round to nearest' },
    { name: 'min', usage: 'min(a, b, ...)', desc: 'Minimum value' },
    { name: 'max', usage: 'max(a, b, ...)', desc: 'Maximum value' },
    { name: 'pow', usage: 'pow(x, y)', desc: 'x to the power of y' },
    { name: 'sqrt', usage: 'sqrt(x)', desc: 'Square root' },
    { name: 'sin', usage: 'sin(x)', desc: 'Sine (radians)' },
    { name: 'cos', usage: 'cos(x)', desc: 'Cosine (radians)' },
    { name: 'tan', usage: 'tan(x)', desc: 'Tangent (radians)' },
    { name: 'log', usage: 'log(x)', desc: 'Natural logarithm' },
    { name: 'exp', usage: 'exp(x)', desc: 'e^x' },
    { name: 'clamp', usage: 'clamp(x, min, max)', desc: 'Clamp value between min and max' },
    { name: 'lerp', usage: 'lerp(a, b, t)', desc: 'Linear interpolation (t: 0-1)' },
    { name: 'map', usage: 'map(x, inMin, inMax, outMin, outMax)', desc: 'Map value from one range to another' },
    { name: 'smoothstep', usage: 'smoothstep(edge0, edge1, x)', desc: 'Smooth Hermite interpolation' },
    { name: 'step', usage: 'step(edge, x)', desc: 'Returns 0 if x < edge, else 1' },
    { name: 'sign', usage: 'sign(x)', desc: 'Returns -1, 0, or 1' },
    { name: 'fract', usage: 'fract(x)', desc: 'Fractional part of x' },
    { name: 'mod', usage: 'mod(x, y)', desc: 'Modulo (always positive)' },
    { name: 'degrees', usage: 'degrees(rad)', desc: 'Convert radians to degrees' },
    { name: 'radians', usage: 'radians(deg)', desc: 'Convert degrees to radians' },
  ];

  // All values
  let values = $state<AnyValueDefinition[]>([]);
  let liveValues = $state<Record<string, unknown>>({});

  // Computed value form
  let computedForm = $state({
    id: '',
    name: '',
    expression: '',
    dependencies: '',
  });

  // Filter
  let filterSource = $state<string>('all');
  let filterCategory = $state<string>('');
  let searchQuery = $state<string>('');

  let updateInterval: ReturnType<typeof setInterval> | null = null;

  onMount(async () => {
    // Ensure audioBridge is initialized (restores config)
    await audioBridge.initialize();
    
    refreshValues();

    // Live value updates
    updateInterval = setInterval(() => {
      const newLive: Record<string, unknown> = {};
      for (const v of values) {
        newLive[v.id] = valueManager.get(v.id);
      }
      liveValues = newLive;
    }, 50);

    // Listen to value changes
    const unsubAdd = valueManager.on('add', refreshValues);
    const unsubRemove = valueManager.on('remove', refreshValues);

    return () => {
      if (updateInterval) clearInterval(updateInterval);
      unsubAdd();
      unsubRemove();
    };
  });

  function refreshValues() {
    values = valueManager.getAllDefinitions();
  }

  function createComputedValue() {
    if (!computedForm.id.trim()) {
      toast.error('Please enter a value ID');
      return;
    }

    if (!computedForm.expression.trim()) {
      toast.error('Please enter an expression');
      return;
    }

    const dependencies = computedForm.dependencies
      .split(',')
      .map(d => d.trim())
      .filter(d => d);

    try {
      valueManager.createComputed(
        computedForm.id,
        computedForm.name || computedForm.id,
        computedForm.expression,
        dependencies
      );

      toast.success(`Computed value "${computedForm.id}" created`);
      refreshValues();

      computedForm = {
        id: '',
        name: '',
        expression: '',
        dependencies: '',
      };
    } catch (error) {
      toast.error('Failed to create computed value: ' + error);
    }
  }

  function removeValue(id: string) {
    valueManager.unregister(id);
    toast.success('Value removed');
    refreshValues();
  }

  function resetValue(id: string) {
    valueManager.reset(id);
    toast.success('Value reset to default');
  }

  // Filtered values using $derived instead of $effect to avoid infinite loop
  let filteredValues = $derived.by(() => {
    let filtered = values;

    if (filterSource !== 'all') {
      filtered = filtered.filter(v => v.source.type === filterSource);
    }

    if (filterCategory) {
      filtered = filtered.filter(v => v.category === filterCategory);
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(v => 
        v.id.toLowerCase().includes(q) || 
        v.name.toLowerCase().includes(q)
      );
    }

    return filtered;
  });

  function formatValue(value: unknown, def: AnyValueDefinition): string {
    if (value === undefined || value === null) return '-';
    
    if (def.type === 'number') {
      const numDef = def as NumberValueDefinition;
      const precision = numDef.precision ?? 3;
      const num = Number(value);
      const formatted = num.toFixed(precision);
      return numDef.unit ? `${formatted} ${numDef.unit}` : formatted;
    }

    if (def.type === 'boolean') {
      return value ? 'true' : 'false';
    }

    if (def.type === 'array') {
      return `[${(value as unknown[]).length} items]`;
    }

    return String(value);
  }

  function getSourceBadgeClass(sourceType: string): string {
    switch (sourceType) {
      case 'audio': return 'bg-blue-500/20 text-blue-400';
      case 'computed': return 'bg-purple-500/20 text-purple-400';
      case 'manual': return 'bg-green-500/20 text-green-400';
      case 'system': return 'bg-yellow-500/20 text-yellow-400';
      default: return 'bg-white/10 text-white/60';
    }
  }

  // Get unique categories
  let categories = $derived([...new Set(values.map(v => v.category).filter(Boolean))]);
</script>

<div class="w-full h-full p-6 overflow-auto">
  <div class="max-w-6xl mx-auto space-y-8">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold">Value Monitor</h1>
        <p class="text-white/60 text-sm mt-1">View and manage all reactive values</p>
      </div>
      <Button variant="outline" size="sm" onclick={refreshValues}>
        <RefreshCw class="size-4 mr-2" />
        Refresh
      </Button>
    </div>

    <!-- Create Computed Value -->
    <section class="bg-white/5 rounded-lg p-6 border border-white/10">
      <h2 class="text-lg font-semibold mb-4 flex items-center gap-2">
        <Calculator class="size-5" />
        Create Computed Value
      </h2>

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

        <div class="space-y-2">
          <Label>Dependencies (comma-separated)</Label>
          <Input
            bind:value={computedForm.dependencies}
            placeholder="e.g., audio.bass, audio.subBass"
          />
        </div>

        <div class="space-y-2">
          <Label>Expression *</Label>
          <Input
            bind:value={computedForm.expression}
            placeholder="e.g., (audio.bass + audio.mid) / 2"
            class="font-mono"
          />
          <div class="flex flex-wrap gap-1 mt-2">
            <span class="text-xs text-white/40 mr-1">Functions:</span>
            <Tooltip.Provider>
              {#each expressionFunctions as fn}
                <Tooltip.Root>
                  <Tooltip.Trigger>
                    <span class="px-1.5 py-0.5 text-xs bg-white/10 rounded cursor-help hover:bg-white/20 transition-colors font-mono">
                      {fn.name}
                    </span>
                  </Tooltip.Trigger>
                  <Tooltip.Content>
                    <div class="text-sm">
                      <div class="font-mono font-semibold text-blue-400">{fn.usage}</div>
                      <div class="text-black/80 mt-1">{fn.desc}</div>
                    </div>
                  </Tooltip.Content>
                </Tooltip.Root>
              {/each}
            </Tooltip.Provider>
          </div>
          <p class="text-xs text-white/40 mt-1">
            Use dot or underscore notation (audio.bass or audio_bass)
          </p>
        </div>
      </div>

      <div class="mt-6 flex justify-end">
        <Button onclick={createComputedValue} disabled={!computedForm.id.trim() || !computedForm.expression.trim()}>
          <Plus class="size-4 mr-2" />
          Create Computed
        </Button>
      </div>
    </section>

    <!-- Filters -->
    <div class="flex flex-wrap gap-4 items-end">
      <div class="space-y-1">
        <Label class="text-xs">Source Type</Label>
        <Select.Root type="single" bind:value={filterSource}>
          <Select.Trigger class="w-40">
            {filterSource === 'all' ? 'All Sources' : filterSource.charAt(0).toUpperCase() + filterSource.slice(1)}
          </Select.Trigger>
          <Select.Content>
            <Select.Item value="all" label="All Sources" />
            <Select.Item value="audio" label="Audio" />
            <Select.Item value="computed" label="Computed" />
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
              {filterCategory || 'All Categories'}
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
        <Input
          bind:value={searchQuery}
          placeholder="Search values..."
        />
      </div>
    </div>

    <!-- Values Table -->
    <section class="bg-white/5 rounded-lg border border-white/10 overflow-hidden">
      <div class="p-4 border-b border-white/10 flex items-center gap-2">
        <Eye class="size-5" />
        <h2 class="text-lg font-semibold">All Values</h2>
        <span class="text-sm text-white/50">({filteredValues.length})</span>
      </div>

      {#if filteredValues.length === 0}
        <div class="text-center py-12 text-white/60">
          <p>No values registered</p>
          <p class="text-sm mt-2">Create bindings or computed values to see them here</p>
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
                  <td class="px-4 py-3 font-mono text-sm text-blue-400">{valueDef.id}</td>
                  <td class="px-4 py-3 text-sm">{valueDef.name}</td>
                  <td class="px-4 py-3">
                    <div class="flex items-center gap-2">
                      {#if valueDef.type === 'number'}
                        <div class="w-16 h-2 bg-white/10 rounded overflow-hidden">
                          <div 
                            class="h-full bg-blue-500 transition-all duration-75"
                            style="width: {Math.min(100, Math.max(0, (liveValues[valueDef.id] as number ?? 0) * 100))}%"
                          ></div>
                        </div>
                      {/if}
                      <span class="font-mono text-sm">
                        {formatValue(liveValues[valueDef.id], valueDef)}
                      </span>
                    </div>
                  </td>
                  <td class="px-4 py-3">
                    <span class="px-2 py-1 rounded text-xs bg-white/10">{valueDef.type}</span>
                  </td>
                  <td class="px-4 py-3">
                    <span class="px-2 py-1 rounded text-xs {getSourceBadgeClass(valueDef.source.type)}">
                      {valueDef.source.type}
                    </span>
                  </td>
                  <td class="px-4 py-3">
                    <div class="flex items-center gap-1">
                      <Button variant="ghost" size="sm" onclick={() => resetValue(valueDef.id)} title="Reset to default">
                        <RefreshCw class="size-3" />
                      </Button>
                      <Button variant="ghost" size="sm" onclick={() => removeValue(valueDef.id)} title="Remove">
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
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
      <div class="bg-white/5 rounded-lg p-4 border border-white/10">
        <div class="text-2xl font-bold">{values.length}</div>
        <div class="text-sm text-white/50">Total Values</div>
      </div>
      <div class="bg-white/5 rounded-lg p-4 border border-white/10">
        <div class="text-2xl font-bold text-blue-400">
          {values.filter(v => v.source.type === 'audio').length}
        </div>
        <div class="text-sm text-white/50">Audio Values</div>
      </div>
      <div class="bg-white/5 rounded-lg p-4 border border-white/10">
        <div class="text-2xl font-bold text-purple-400">
          {values.filter(v => v.source.type === 'computed').length}
        </div>
        <div class="text-sm text-white/50">Computed Values</div>
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
