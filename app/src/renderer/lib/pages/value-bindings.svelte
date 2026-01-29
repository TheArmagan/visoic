<script lang="ts">
  import { onMount } from 'svelte';
  import { audioBridge, valueManager, type AudioExtraction, type NumberValueDefinition } from '$lib/api/values';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import { Slider } from '$lib/components/ui/slider';
  import * as Select from '$lib/components/ui/select';
  import { toast } from 'svelte-sonner';
  import { Plus, Trash2, Link, Unlink, Eye, Activity, Waves, Music } from '@lucide/svelte';

  // Analyzer list
  let analyzers = $state<Array<{ id: string; label: string }>>([]);
  let selectedAnalyzerId = $state<string>('');

  // Binding configuration
  let bindingConfig = $state({
    valueId: '',
    valueName: '',
    extractionType: 'frequencyRange' as AudioExtraction['type'],
    lowFreq: 60,
    highFreq: 250,
    mode: 'average' as AudioExtraction['mode'],
    band: 'bass' as AudioExtraction['band'],
    smoothing: [0.5],
    outputMin: 0,
    outputMax: 1,
  });

  // Active bindings
  let bindings = $state<Array<{
    valueId: string;
    analyzerId: string;
    extraction: AudioExtraction;
    currentValue: number;
  }>>([]);

  // Value preview
  let previewValues = $state<Record<string, number>>({});
  let previewInterval: ReturnType<typeof setInterval> | null = null;

  const extractionTypes: { value: AudioExtraction['type']; label: string }[] = [
    { value: 'frequencyRange', label: 'Frequency Range' },
    { value: 'frequencyBand', label: 'Frequency Band' },
    { value: 'amplitude', label: 'Amplitude' },
    { value: 'rms', label: 'RMS Level' },
    { value: 'peak', label: 'Peak' },
    { value: 'bpm', label: 'BPM' },
    { value: 'beat', label: 'Beat' },
  ];

  const frequencyBands: { value: string; label: string }[] = [
    { value: 'subBass', label: 'Sub Bass (20-60Hz)' },
    { value: 'bass', label: 'Bass (60-250Hz)' },
    { value: 'lowMid', label: 'Low Mid (250-500Hz)' },
    { value: 'mid', label: 'Mid (500-2kHz)' },
    { value: 'upperMid', label: 'Upper Mid (2-4kHz)' },
    { value: 'presence', label: 'Presence (4-6kHz)' },
    { value: 'brilliance', label: 'Brilliance (6-20kHz)' },
  ];

  const calculationModes: { value: string; label: string }[] = [
    { value: 'average', label: 'Average' },
    { value: 'peak', label: 'Peak' },
    { value: 'rms', label: 'RMS' },
    { value: 'sum', label: 'Sum' },
    { value: 'weighted', label: 'Weighted' },
  ];

  onMount(async () => {
    // Ensure audioBridge is initialized before accessing data
    await audioBridge.initialize();
    
    refreshAnalyzers();
    refreshBindings();

    // Update preview values
    previewInterval = setInterval(() => {
      const newPreview: Record<string, number> = {};
      for (const binding of bindings) {
        const value = valueManager.get<number>(binding.valueId);
        if (value !== undefined) {
          newPreview[binding.valueId] = value;
        }
      }
      previewValues = newPreview;
    }, 50);

    return () => {
      if (previewInterval) clearInterval(previewInterval);
    };
  });

  function refreshAnalyzers() {
    const handles = audioBridge.getAnalyzers();
    analyzers = handles.map(h => ({ id: h.id, label: h.analyzer.label }));
    
    if (analyzers.length > 0 && !selectedAnalyzerId) {
      selectedAnalyzerId = analyzers[0].id;
    }
  }

  function refreshBindings() {
    const currentBindings = audioBridge.getBindings();
    bindings = currentBindings.map(b => ({
      ...b,
      currentValue: valueManager.get<number>(b.valueId) ?? 0,
    }));
  }

  function createBinding() {
    if (!selectedAnalyzerId) {
      toast.error('Please select an analyzer');
      return;
    }

    if (!bindingConfig.valueId.trim()) {
      toast.error('Please enter a value ID');
      return;
    }

    const extraction: AudioExtraction = {
      type: bindingConfig.extractionType,
      smoothing: bindingConfig.smoothing[0],
    };

    if (bindingConfig.extractionType === 'frequencyRange') {
      extraction.lowFreq = bindingConfig.lowFreq;
      extraction.highFreq = bindingConfig.highFreq;
      extraction.mode = bindingConfig.mode;
    }

    if (bindingConfig.extractionType === 'frequencyBand') {
      extraction.band = bindingConfig.band;
    }

    if (bindingConfig.outputMin !== 0 || bindingConfig.outputMax !== 1) {
      extraction.outputRange = {
        min: bindingConfig.outputMin,
        max: bindingConfig.outputMax,
      };
    }

    audioBridge.bind(
      bindingConfig.valueId,
      selectedAnalyzerId,
      extraction,
      {
        name: bindingConfig.valueName || bindingConfig.valueId,
        min: bindingConfig.outputMin,
        max: bindingConfig.outputMax,
      }
    );

    toast.success(`Bound "${bindingConfig.valueId}" to analyzer`);
    refreshBindings();

    // Reset form
    bindingConfig = {
      ...bindingConfig,
      valueId: '',
      valueName: '',
    };
  }

  function removeBinding(valueId: string) {
    audioBridge.unbind(valueId);
    valueManager.unregister(valueId);
    toast.success('Binding removed');
    refreshBindings();
  }

  function getExtractionLabel(extraction: AudioExtraction): string {
    switch (extraction.type) {
      case 'frequencyRange':
        return `${extraction.lowFreq}-${extraction.highFreq}Hz (${extraction.mode})`;
      case 'frequencyBand':
        return extraction.band || 'band';
      default:
        return extraction.type;
    }
  }

  function formatValue(value: number, extraction: AudioExtraction): string {
    if (extraction.type === 'bpm') {
      return value.toFixed(0) + ' BPM';
    }
    return value.toFixed(3);
  }
</script>

<div class="w-full h-full p-6 overflow-auto">
  <div class="max-w-5xl mx-auto space-y-8">
    <!-- Header -->
    <div>
      <h1 class="text-2xl font-bold">Value Bindings</h1>
      <p class="text-white/60 text-sm mt-1">Map FFT analyzer outputs to reactive values</p>
    </div>

    <!-- Analyzer Selection -->
    <section class="bg-white/5 rounded-lg p-6 border border-white/10">
      <h2 class="text-lg font-semibold mb-4">Select Analyzer</h2>

      {#if analyzers.length === 0}
        <div class="text-center py-8 text-white/60">
          <p>No analyzers available</p>
          <p class="text-sm mt-2">Create an analyzer in the Audio Sources page first</p>
        </div>
      {:else}
        <div class="flex flex-wrap gap-2">
          {#each analyzers as analyzer}
            <button
              class="px-4 py-2 rounded-lg border transition-all
                {selectedAnalyzerId === analyzer.id
                  ? 'bg-blue-500/20 border-blue-500 text-blue-400'
                  : 'bg-white/5 border-white/10 hover:border-white/20'}"
              onclick={() => selectedAnalyzerId = analyzer.id}
            >
              {analyzer.label}
            </button>
          {/each}
        </div>
      {/if}
    </section>

    <!-- Create Binding -->
    {#if selectedAnalyzerId}
      <section class="bg-white/5 rounded-lg p-6 border border-white/10">
        <h2 class="text-lg font-semibold mb-4 flex items-center gap-2">
          <Link class="size-5" />
          Create Value Binding
        </h2>

        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <!-- Value ID -->
          <div class="space-y-2">
            <Label>Value ID *</Label>
            <Input
              bind:value={bindingConfig.valueId}
              placeholder="e.g., audio.bass"
            />
            <p class="text-xs text-white/40">Unique identifier for this value</p>
          </div>

          <!-- Value Name -->
          <div class="space-y-2">
            <Label>Display Name</Label>
            <Input
              bind:value={bindingConfig.valueName}
              placeholder="e.g., Bass Level"
            />
          </div>

          <!-- Extraction Type -->
          <div class="space-y-2">
            <Label>Extraction Type</Label>
            <Select.Root type="single" bind:value={bindingConfig.extractionType}>
              <Select.Trigger class="w-full">
                {extractionTypes.find(t => t.value === bindingConfig.extractionType)?.label || 'Select type'}
              </Select.Trigger>
              <Select.Content>
                {#each extractionTypes as type}
                  <Select.Item value={type.value} label={type.label} />
                {/each}
              </Select.Content>
            </Select.Root>
          </div>

          <!-- Frequency Range Options -->
          {#if bindingConfig.extractionType === 'frequencyRange'}
            <div class="space-y-2">
              <Label>Low Frequency (Hz)</Label>
              <Input
                type="number"
                bind:value={bindingConfig.lowFreq}
                min={20}
                max={20000}
              />
            </div>

            <div class="space-y-2">
              <Label>High Frequency (Hz)</Label>
              <Input
                type="number"
                bind:value={bindingConfig.highFreq}
                min={20}
                max={20000}
              />
            </div>

            <div class="space-y-2">
              <Label>Calculation Mode</Label>
              <Select.Root type="single" bind:value={bindingConfig.mode}>
                <Select.Trigger class="w-full">
                  {calculationModes.find(m => m.value === bindingConfig.mode)?.label || 'Select mode'}
                </Select.Trigger>
                <Select.Content>
                  {#each calculationModes as mode}
                    <Select.Item value={mode.value} label={mode.label} />
                  {/each}
                </Select.Content>
              </Select.Root>
            </div>
          {/if}

          <!-- Frequency Band Options -->
          {#if bindingConfig.extractionType === 'frequencyBand'}
            <div class="space-y-2">
              <Label>Band</Label>
              <Select.Root type="single" bind:value={bindingConfig.band}>
                <Select.Trigger class="w-full">
                  {frequencyBands.find(b => b.value === bindingConfig.band)?.label || 'Select band'}
                </Select.Trigger>
                <Select.Content>
                  {#each frequencyBands as band}
                    <Select.Item value={band.value} label={band.label} />
                  {/each}
                </Select.Content>
              </Select.Root>
            </div>
          {/if}

          <!-- Smoothing -->
          <div class="space-y-3">
            <Label>Smoothing: {bindingConfig.smoothing[0].toFixed(2)}</Label>
            <Slider
              bind:value={bindingConfig.smoothing}
              min={0}
              max={0.99}
              step={0.01}
            />
          </div>

          <!-- Output Range -->
          <div class="space-y-2">
            <Label>Output Min</Label>
            <Input
              type="number"
              bind:value={bindingConfig.outputMin}
              step={0.1}
            />
          </div>

          <div class="space-y-2">
            <Label>Output Max</Label>
            <Input
              type="number"
              bind:value={bindingConfig.outputMax}
              step={0.1}
            />
          </div>
        </div>

        <div class="mt-6 flex justify-end">
          <Button onclick={createBinding} disabled={!bindingConfig.valueId.trim()}>
            <Plus class="size-4 mr-2" />
            Create Binding
          </Button>
        </div>
      </section>
    {/if}

    <!-- Active Bindings -->
    <section class="bg-white/5 rounded-lg p-6 border border-white/10">
      <h2 class="text-lg font-semibold mb-4 flex items-center gap-2">
        <Eye class="size-5" />
        Active Bindings
        <span class="text-sm font-normal text-white/50">({bindings.length})</span>
      </h2>

      {#if bindings.length === 0}
        <div class="text-center py-8 text-white/60">
          <p>No bindings created yet</p>
        </div>
      {:else}
        <div class="space-y-3">
          {#each bindings as binding}
            <div class="flex items-center gap-4 p-4 bg-white/5 rounded-lg border border-white/10">
              <!-- Value indicator bar -->
              <div class="w-24 h-8 bg-white/10 rounded overflow-hidden relative">
                <div 
                  class="absolute inset-y-0 left-0 bg-blue-500 transition-all duration-75"
                  style="width: {Math.min(100, (previewValues[binding.valueId] ?? 0) * 100)}%"
                ></div>
                <span class="absolute inset-0 flex items-center justify-center text-xs font-mono">
                  {formatValue(previewValues[binding.valueId] ?? 0, binding.extraction)}
                </span>
              </div>

              <div class="flex-1 min-w-0">
                <div class="font-medium font-mono text-blue-400">{binding.valueId}</div>
                <div class="text-xs text-white/50 mt-1">
                  {getExtractionLabel(binding.extraction)}
                  {#if binding.extraction.smoothing}
                    • Smooth: {binding.extraction.smoothing}
                  {/if}
                </div>
              </div>

              <Button variant="ghost" size="sm" onclick={() => removeBinding(binding.valueId)}>
                <Unlink class="size-4 text-red-400" />
              </Button>
            </div>
          {/each}
        </div>
      {/if}
    </section>
  </div>
</div>
