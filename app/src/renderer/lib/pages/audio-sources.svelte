<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { audioManager, type AudioDeviceInfo, type CreateAnalyzerOptions, type NormalizationConfig, DEFAULT_NORMALIZATION_CONFIG } from '$lib/api/audio';
  import { audioBridge } from '$lib/api/values';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import { Slider } from '$lib/components/ui/slider';
  import { Switch } from '$lib/components/ui/switch';
  import * as Select from '$lib/components/ui/select';
  import { toast } from 'svelte-sonner';
  import { Plus, Trash2, Mic, MicOff, RefreshCw, Settings2, ChevronRight, ChevronDown, Pencil, X, Check } from '@lucide/svelte';

  let devices: AudioDeviceInfo[] = $state([]);
  let selectedDeviceId: string = $state('default');
  let isLoading: boolean = $state(true);
  let isInitialized: boolean = $state(false);

  // Editing state
  let editingAnalyzerId: string | null = $state(null);
  let editForm = $state<{
    fftSize: number;
    smoothing: number[];
    gain: number[];
    normalizationEnabled: boolean;
    normalization: {
      targetLevel: number[];
      attackTime: number[];
      releaseTime: number[];
      maxGain: number[];
      minGain: number[];
      useCompressor: boolean;
      compressorThreshold: number[];
      compressorRatio: number[];
    };
  }>({
    fftSize: 1024,
    smoothing: [0.8],
    gain: [1.0],
    normalizationEnabled: false,
    normalization: {
      targetLevel: [DEFAULT_NORMALIZATION_CONFIG.targetLevel],
      attackTime: [DEFAULT_NORMALIZATION_CONFIG.attackTime],
      releaseTime: [DEFAULT_NORMALIZATION_CONFIG.releaseTime],
      maxGain: [DEFAULT_NORMALIZATION_CONFIG.maxGain],
      minGain: [DEFAULT_NORMALIZATION_CONFIG.minGain],
      useCompressor: DEFAULT_NORMALIZATION_CONFIG.useCompressor,
      compressorThreshold: [DEFAULT_NORMALIZATION_CONFIG.compressorThreshold],
      compressorRatio: [DEFAULT_NORMALIZATION_CONFIG.compressorRatio],
    },
  });

  // Analyzer creation form
  let newAnalyzerConfig = $state<CreateAnalyzerOptions & { 
    smoothingValue: number[], 
    gainValue: number[],
    normalization: {
      targetLevel: number[];
      attackTime: number[];
      releaseTime: number[];
      maxGain: number[];
      minGain: number[];
      useCompressor: boolean;
      compressorThreshold: number[];
      compressorRatio: number[];
    }
  }>({
    fftSize: 1024,
    smoothingTimeConstant: 0.8,
    gain: 1.0,
    label: '',
    normalizationEnabled: false,
    smoothingValue: [0.8],
    gainValue: [1.0],
    normalization: {
      targetLevel: [DEFAULT_NORMALIZATION_CONFIG.targetLevel],
      attackTime: [DEFAULT_NORMALIZATION_CONFIG.attackTime],
      releaseTime: [DEFAULT_NORMALIZATION_CONFIG.releaseTime],
      maxGain: [DEFAULT_NORMALIZATION_CONFIG.maxGain],
      minGain: [DEFAULT_NORMALIZATION_CONFIG.minGain],
      useCompressor: DEFAULT_NORMALIZATION_CONFIG.useCompressor,
      compressorThreshold: [DEFAULT_NORMALIZATION_CONFIG.compressorThreshold],
      compressorRatio: [DEFAULT_NORMALIZATION_CONFIG.compressorRatio],
    }
  });

  // Created analyzers
  let analyzers = $state<Array<{
    id: string;
    label: string;
    deviceId: string;
    fftSize: number;
    smoothing: number;
    gain: number;
    normalization: boolean;
  }>>([]);

  const fftSizes = [32, 64, 128, 256, 512, 1024, 2048, 4096, 8192, 16384, 32768];

  onMount(async () => {
    try {
      await audioManager.initialize();
      await audioBridge.initialize();
      isInitialized = true;
      await refreshDevices();
      refreshAnalyzers();
    } catch (error) {
      toast.error('Failed to initialize audio: ' + error);
    } finally {
      isLoading = false;
    }
  });

  function refreshAnalyzers() {
    const handles = audioBridge.getAnalyzers();
    analyzers = handles.map(h => {
      const config = h.analyzer.getConfig();
      return {
        id: h.id,
        label: h.analyzer.label,
        deviceId: h.deviceId || 'default',
        fftSize: config.fftSize,
        smoothing: config.smoothingTimeConstant,
        gain: config.gain,
        normalization: config.normalizationEnabled ?? false,
      };
    });
  }

  async function refreshDevices() {
    try {
      devices = await audioManager.refreshDevices();
      devices = devices.filter(d => d.kind === 'audioinput');
      
      if (devices.length > 0 && !devices.find(d => d.deviceId === selectedDeviceId)) {
        selectedDeviceId = devices[0].deviceId;
      }
    } catch (error) {
      toast.error('Failed to refresh devices: ' + error);
    }
  }

  async function createAnalyzer() {
    if (!isInitialized) {
      toast.error('Audio not initialized');
      return;
    }

    try {
      const config: CreateAnalyzerOptions = {
        deviceId: selectedDeviceId,
        fftSize: newAnalyzerConfig.fftSize as any,
        smoothingTimeConstant: newAnalyzerConfig.smoothingValue[0],
        gain: newAnalyzerConfig.gainValue[0],
        label: newAnalyzerConfig.label || `Analyzer ${analyzers.length + 1}`,
        normalizationEnabled: newAnalyzerConfig.normalizationEnabled,
      };

      // Add normalization config if enabled
      if (newAnalyzerConfig.normalizationEnabled) {
        config.normalization = {
          targetLevel: newAnalyzerConfig.normalization.targetLevel[0],
          attackTime: newAnalyzerConfig.normalization.attackTime[0],
          releaseTime: newAnalyzerConfig.normalization.releaseTime[0],
          maxGain: newAnalyzerConfig.normalization.maxGain[0],
          minGain: newAnalyzerConfig.normalization.minGain[0],
          useCompressor: newAnalyzerConfig.normalization.useCompressor,
          compressorThreshold: newAnalyzerConfig.normalization.compressorThreshold[0],
          compressorRatio: newAnalyzerConfig.normalization.compressorRatio[0],
        };
      }

      const handle = await audioBridge.createAnalyzer(config);

      toast.success(`Analyzer "${handle.analyzer.label}" created`);
      refreshAnalyzers();

      // Reset form
      newAnalyzerConfig = {
        fftSize: 1024,
        smoothingTimeConstant: 0.8,
        gain: 1.0,
        label: '',
        normalizationEnabled: false,
        smoothingValue: [0.8],
        gainValue: [1.0],
        normalization: {
          targetLevel: [DEFAULT_NORMALIZATION_CONFIG.targetLevel],
          attackTime: [DEFAULT_NORMALIZATION_CONFIG.attackTime],
          releaseTime: [DEFAULT_NORMALIZATION_CONFIG.releaseTime],
          maxGain: [DEFAULT_NORMALIZATION_CONFIG.maxGain],
          minGain: [DEFAULT_NORMALIZATION_CONFIG.minGain],
          useCompressor: DEFAULT_NORMALIZATION_CONFIG.useCompressor,
          compressorThreshold: [DEFAULT_NORMALIZATION_CONFIG.compressorThreshold],
          compressorRatio: [DEFAULT_NORMALIZATION_CONFIG.compressorRatio],
        }
      };
    } catch (error) {
      toast.error('Failed to create analyzer: ' + error);
    }
  }

  function removeAnalyzer(id: string) {
    audioBridge.removeAnalyzer(id);
    refreshAnalyzers();
    toast.success('Analyzer removed');
  }

  function startEditing(analyzer: typeof analyzers[0]) {
    editingAnalyzerId = analyzer.id;
    const handle = audioBridge.getAnalyzer(analyzer.id);
    const normConfig = handle?.analyzer.getNormalizationConfig() ?? DEFAULT_NORMALIZATION_CONFIG;
    editForm = {
      fftSize: analyzer.fftSize,
      smoothing: [analyzer.smoothing],
      gain: [analyzer.gain],
      normalizationEnabled: analyzer.normalization,
      normalization: {
        targetLevel: [normConfig.targetLevel],
        attackTime: [normConfig.attackTime],
        releaseTime: [normConfig.releaseTime],
        maxGain: [normConfig.maxGain],
        minGain: [normConfig.minGain],
        useCompressor: normConfig.useCompressor,
        compressorThreshold: [normConfig.compressorThreshold],
        compressorRatio: [normConfig.compressorRatio],
      },
    };
  }

  function cancelEditing() {
    editingAnalyzerId = null;
  }

  function saveAnalyzerEdit(id: string) {
    const handle = audioBridge.getAnalyzer(id);
    if (!handle) return;

    // Update basic config
    audioBridge.updateAnalyzerConfig(id, {
      fftSize: editForm.fftSize,
      smoothingTimeConstant: editForm.smoothing[0],
      gain: editForm.gain[0],
    });

    // Update normalization
    if (editForm.normalizationEnabled) {
      handle.analyzer.enableNormalization({
        targetLevel: editForm.normalization.targetLevel[0],
        attackTime: editForm.normalization.attackTime[0],
        releaseTime: editForm.normalization.releaseTime[0],
        maxGain: editForm.normalization.maxGain[0],
        minGain: editForm.normalization.minGain[0],
        useCompressor: editForm.normalization.useCompressor,
        compressorThreshold: editForm.normalization.compressorThreshold[0],
        compressorRatio: editForm.normalization.compressorRatio[0],
      });
    } else {
      handle.analyzer.disableNormalization();
    }

    toast.success('Analyzer updated');
    refreshAnalyzers();
    editingAnalyzerId = null;
  }

  function getDeviceLabel(deviceId: string): string {
    const device = devices.find(d => d.deviceId === deviceId);
    return device?.label || deviceId;
  }
</script>

<div class="w-full h-full p-6 overflow-auto">
  <div class="max-w-4xl mx-auto space-y-8">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold">Audio Sources</h1>
        <p class="text-white/60 text-sm mt-1">Configure input devices and FFT analyzers</p>
      </div>
      <Button variant="outline" size="sm" onclick={refreshDevices} disabled={isLoading}>
        <RefreshCw class="size-4 mr-2" />
        Refresh Devices
      </Button>
    </div>

    {#if isLoading}
      <div class="flex items-center justify-center py-12">
        <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
      </div>
    {:else}
      <!-- Device Selection -->
      <section class="bg-white/5 rounded-lg p-6 border border-white/10">
        <h2 class="text-lg font-semibold mb-4 flex items-center gap-2">
          <Mic class="size-5" />
          Input Devices
        </h2>

        {#if devices.length === 0}
          <div class="text-center py-8 text-white/60">
            <MicOff class="size-12 mx-auto mb-4 opacity-50" />
            <p>No audio input devices found</p>
            <p class="text-sm mt-2">Make sure you have granted microphone permission</p>
          </div>
        {:else}
          <div class="grid gap-3">
            {#each devices as device}
              <button
                class="flex items-center gap-4 p-4 rounded-lg border transition-all text-left w-full
                  {selectedDeviceId === device.deviceId 
                    ? 'bg-white/10 border-blue-500' 
                    : 'bg-white/5 border-white/10 hover:border-white/20'}"
                onclick={() => selectedDeviceId = device.deviceId}
              >
                <div class="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center">
                  <Mic class="size-5" />
                </div>
                <div class="flex-1 min-w-0">
                  <div class="font-medium truncate">{device.label}</div>
                  <div class="text-xs text-white/50 truncate">{device.deviceId}</div>
                </div>
                {#if device.isDefault}
                  <span class="px-2 py-1 rounded text-xs bg-blue-500/20 text-blue-400">Default</span>
                {/if}
                {#if selectedDeviceId === device.deviceId}
                  <div class="w-3 h-3 rounded-full bg-blue-500"></div>
                {/if}
              </button>
            {/each}
          </div>
        {/if}
      </section>

      <!-- Create Analyzer -->
      <section class="bg-white/5 rounded-lg p-6 border border-white/10">
        <h2 class="text-lg font-semibold mb-4 flex items-center gap-2">
          <Plus class="size-5" />
          Create FFT Analyzer
        </h2>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <!-- Label -->
          <div class="space-y-2">
            <Label>Label</Label>
            <Input
              bind:value={newAnalyzerConfig.label}
              placeholder="e.g., Bass Analyzer"
            />
          </div>

          <!-- FFT Size -->
          <div class="space-y-2">
            <Label>FFT Size</Label>
            <Select.Root type="single" bind:value={newAnalyzerConfig.fftSize} onValueChange={(v) => newAnalyzerConfig.fftSize = Number(v)}>
              <Select.Trigger class="w-full">
                {newAnalyzerConfig.fftSize} ({(newAnalyzerConfig.fftSize as number) / 2} bins)
              </Select.Trigger>
              <Select.Content>
                {#each fftSizes as size}
                  <Select.Item value={size} label="{size} ({size / 2} bins)" />
                {/each}
              </Select.Content>
            </Select.Root>
          </div>

          <!-- Smoothing -->
          <div class="space-y-3">
            <Label>
              Smoothing: {newAnalyzerConfig.smoothingValue[0].toFixed(2)}
            </Label>
            <Slider
              bind:value={newAnalyzerConfig.smoothingValue}
              min={0}
              max={1}
              step={0.01}
            />
            <div class="flex justify-between text-xs text-white/40">
              <span>Fast (0)</span>
              <span>Smooth (1)</span>
            </div>
          </div>

          <!-- Gain -->
          <div class="space-y-3">
            <Label>
              Gain: {newAnalyzerConfig.gainValue[0].toFixed(2)}x
            </Label>
            <Slider
              bind:value={newAnalyzerConfig.gainValue}
              min={0.1}
              max={5}
              step={0.1}
            />
            <div class="flex justify-between text-xs text-white/40">
              <span>0.1x</span>
              <span>5x</span>
            </div>
          </div>

          <!-- Normalization -->
          <div class="md:col-span-2 space-y-4">
            <div class="flex items-center gap-3">
              <Switch
                id="normalization"
                bind:checked={newAnalyzerConfig.normalizationEnabled}
              />
              <Label for="normalization" class="cursor-pointer">
                Enable Volume Normalization
                <span class="text-white/50 font-normal ml-1">(Auto-adjusts gain for consistent levels)</span>
              </Label>
            </div>

            {#if newAnalyzerConfig.normalizationEnabled}
              <div class="border border-white/10 rounded-lg p-4 bg-white/5 space-y-6 mt-4">
                <h3 class="text-sm font-semibold flex items-center gap-2">
                  <Settings2 class="size-4" />
                  Normalization Settings
                </h3>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <!-- Target Level -->
                  <div class="space-y-3">
                    <Label>
                      Target Level: {newAnalyzerConfig.normalization.targetLevel[0].toFixed(2)}
                    </Label>
                    <Slider
                      bind:value={newAnalyzerConfig.normalization.targetLevel}
                      min={0.1}
                      max={1}
                      step={0.05}
                    />
                    <p class="text-xs text-white/40">Target RMS level (0.1 - 1.0)</p>
                  </div>

                  <!-- Attack Time -->
                  <div class="space-y-3">
                    <Label>
                      Attack Time: {newAnalyzerConfig.normalization.attackTime[0].toFixed(2)}
                    </Label>
                    <Slider
                      bind:value={newAnalyzerConfig.normalization.attackTime}
                      min={0.01}
                      max={0.5}
                      step={0.01}
                    />
                    <p class="text-xs text-white/40">Response speed to level changes</p>
                  </div>

                  <!-- Release Time -->
                  <div class="space-y-3">
                    <Label>
                      Release Time: {newAnalyzerConfig.normalization.releaseTime[0].toFixed(2)}
                    </Label>
                    <Slider
                      bind:value={newAnalyzerConfig.normalization.releaseTime}
                      min={0.01}
                      max={0.3}
                      step={0.01}
                    />
                    <p class="text-xs text-white/40">Release speed after loud sounds</p>
                  </div>

                  <!-- Max Gain -->
                  <div class="space-y-3">
                    <Label>
                      Max Gain: {newAnalyzerConfig.normalization.maxGain[0].toFixed(1)}x
                    </Label>
                    <Slider
                      bind:value={newAnalyzerConfig.normalization.maxGain}
                      min={1}
                      max={10}
                      step={0.5}
                    />
                    <p class="text-xs text-white/40">Maximum gain boost allowed</p>
                  </div>

                  <!-- Min Gain -->
                  <div class="space-y-3">
                    <Label>
                      Min Gain: {newAnalyzerConfig.normalization.minGain[0].toFixed(2)}x
                    </Label>
                    <Slider
                      bind:value={newAnalyzerConfig.normalization.minGain}
                      min={0.01}
                      max={1}
                      step={0.01}
                    />
                    <p class="text-xs text-white/40">Minimum gain for limiting</p>
                  </div>

                  <!-- Use Compressor -->
                  <div class="space-y-3">
                    <div class="flex items-center gap-3">
                      <Switch
                        id="useCompressor"
                        bind:checked={newAnalyzerConfig.normalization.useCompressor}
                      />
                      <Label for="useCompressor" class="cursor-pointer">
                        Use Compressor
                        <span class="text-white/50 font-normal ml-1">(Limit peaks)</span>
                      </Label>
                    </div>
                  </div>

                  {#if newAnalyzerConfig.normalization.useCompressor}
                    <!-- Compressor Threshold -->
                    <div class="space-y-3">
                      <Label>
                        Compressor Threshold: {newAnalyzerConfig.normalization.compressorThreshold[0].toFixed(0)} dB
                      </Label>
                      <Slider
                        bind:value={newAnalyzerConfig.normalization.compressorThreshold}
                        min={-60}
                        max={0}
                        step={1}
                      />
                      <p class="text-xs text-white/40">Threshold in decibels</p>
                    </div>

                    <!-- Compressor Ratio -->
                    <div class="space-y-3">
                      <Label>
                        Compressor Ratio: {newAnalyzerConfig.normalization.compressorRatio[0].toFixed(1)}:1
                      </Label>
                      <Slider
                        bind:value={newAnalyzerConfig.normalization.compressorRatio}
                        min={1}
                        max={20}
                        step={0.5}
                      />
                      <p class="text-xs text-white/40">Compression ratio</p>
                    </div>
                  {/if}
                </div>
              </div>
            {/if}
          </div>
        </div>

        <div class="mt-6 flex justify-end">
          <Button onclick={createAnalyzer} disabled={devices.length === 0}>
            <Plus class="size-4 mr-2" />
            Create Analyzer
          </Button>
        </div>
      </section>

      <!-- Active Analyzers -->
      <section class="bg-white/5 rounded-lg p-6 border border-white/10">
        <h2 class="text-lg font-semibold mb-4 flex items-center gap-2">
          <Settings2 class="size-5" />
          Active Analyzers
          <span class="text-sm font-normal text-white/50">({analyzers.length})</span>
        </h2>

        {#if analyzers.length === 0}
          <div class="text-center py-8 text-white/60">
            <p>No analyzers created yet</p>
            <p class="text-sm mt-2">Create an analyzer above to start</p>
          </div>
        {:else}
          <div class="space-y-3">
            {#each analyzers as analyzer}
              <div class="p-4 bg-white/5 rounded-lg border border-white/10">
                {#if editingAnalyzerId === analyzer.id}
                  <!-- Edit Mode -->
                  <div class="space-y-4">
                    <div class="flex items-center justify-between">
                      <div class="font-medium">{analyzer.label}</div>
                      <div class="flex gap-1">
                        <Button variant="ghost" size="sm" onclick={() => saveAnalyzerEdit(analyzer.id)}>
                          <Check class="size-4 text-green-400" />
                        </Button>
                        <Button variant="ghost" size="sm" onclick={cancelEditing}>
                          <X class="size-4 text-white/60" />
                        </Button>
                      </div>
                    </div>

                    <!-- FFT Size -->
                    <div class="space-y-2">
                      <Label class="text-white/70">FFT Size</Label>
                      <Select.Root type="single" bind:value={editForm.fftSize}>
                        <Select.Trigger class="w-full">
                          {editForm.fftSize}
                        </Select.Trigger>
                        <Select.Content>
                          {#each fftSizes as size}
                            <Select.Item value={size}>{size}</Select.Item>
                          {/each}
                        </Select.Content>
                      </Select.Root>
                      <p class="text-xs text-white/40">Higher = more precision, lower performance</p>
                    </div>

                    <div class="grid grid-cols-2 gap-4">
                      <div class="space-y-2">
                        <Label class="text-white/70">Smoothing: {editForm.smoothing[0].toFixed(2)}</Label>
                        <Slider
                          bind:value={editForm.smoothing}
                          min={0}
                          max={0.99}
                          step={0.01}
                        />
                        <p class="text-xs text-white/40">FFT smoothing (0-0.99)</p>
                      </div>

                      <div class="space-y-2">
                        <Label class="text-white/70">Gain: {editForm.gain[0].toFixed(1)}x</Label>
                        <Slider
                          bind:value={editForm.gain}
                          min={0.1}
                          max={5}
                          step={0.1}
                        />
                        <p class="text-xs text-white/40">Volume multiplier</p>
                      </div>
                    </div>

                    <!-- Normalization Toggle -->
                    <div class="flex items-center gap-3 pt-2">
                      <Switch bind:checked={editForm.normalizationEnabled} />
                      <Label class="text-white/70">Volume Normalization</Label>
                    </div>

                    <!-- Normalization Settings -->
                    {#if editForm.normalizationEnabled}
                      <div class="space-y-4 p-4 bg-white/5 rounded-lg border border-white/10">
                        <h4 class="text-sm font-medium text-white/70">Normalization Settings</h4>
                        
                        <div class="grid grid-cols-2 gap-4">
                          <!-- Target Level -->
                          <div class="space-y-2">
                            <Label class="text-white/60 text-xs">
                              Target Level: {editForm.normalization.targetLevel[0].toFixed(2)}
                            </Label>
                            <Slider
                              bind:value={editForm.normalization.targetLevel}
                              min={0.1}
                              max={1}
                              step={0.05}
                            />
                          </div>

                          <!-- Attack Time -->
                          <div class="space-y-2">
                            <Label class="text-white/60 text-xs">
                              Attack Time: {editForm.normalization.attackTime[0].toFixed(2)}s
                            </Label>
                            <Slider
                              bind:value={editForm.normalization.attackTime}
                              min={0.001}
                              max={0.5}
                              step={0.01}
                            />
                          </div>

                          <!-- Release Time -->
                          <div class="space-y-2">
                            <Label class="text-white/60 text-xs">
                              Release Time: {editForm.normalization.releaseTime[0].toFixed(2)}s
                            </Label>
                            <Slider
                              bind:value={editForm.normalization.releaseTime}
                              min={0.01}
                              max={2}
                              step={0.05}
                            />
                          </div>

                          <!-- Max Gain -->
                          <div class="space-y-2">
                            <Label class="text-white/60 text-xs">
                              Max Gain: {editForm.normalization.maxGain[0].toFixed(1)}x
                            </Label>
                            <Slider
                              bind:value={editForm.normalization.maxGain}
                              min={1}
                              max={10}
                              step={0.5}
                            />
                          </div>

                          <!-- Min Gain -->
                          <div class="space-y-2">
                            <Label class="text-white/60 text-xs">
                              Min Gain: {editForm.normalization.minGain[0].toFixed(2)}
                            </Label>
                            <Slider
                              bind:value={editForm.normalization.minGain}
                              min={0}
                              max={1}
                              step={0.05}
                            />
                          </div>
                        </div>

                        <!-- Compressor Toggle -->
                        <div class="flex items-center gap-3 pt-2">
                          <Switch bind:checked={editForm.normalization.useCompressor} />
                          <Label class="text-white/60 text-xs">Use Compressor</Label>
                        </div>

                        {#if editForm.normalization.useCompressor}
                          <div class="grid grid-cols-2 gap-4">
                            <!-- Compressor Threshold -->
                            <div class="space-y-2">
                              <Label class="text-white/60 text-xs">
                                Threshold: {editForm.normalization.compressorThreshold[0].toFixed(0)} dB
                              </Label>
                              <Slider
                                bind:value={editForm.normalization.compressorThreshold}
                                min={-60}
                                max={0}
                                step={1}
                              />
                            </div>

                            <!-- Compressor Ratio -->
                            <div class="space-y-2">
                              <Label class="text-white/60 text-xs">
                                Ratio: {editForm.normalization.compressorRatio[0].toFixed(1)}:1
                              </Label>
                              <Slider
                                bind:value={editForm.normalization.compressorRatio}
                                min={1}
                                max={20}
                                step={0.5}
                              />
                            </div>
                          </div>
                        {/if}
                      </div>
                    {/if}

                    <div class="text-xs text-white/40">
                      Device: {getDeviceLabel(analyzer.deviceId)}
                    </div>
                  </div>
                {:else}
                  <!-- View Mode -->
                  <div class="flex items-center gap-4">
                    <div class="flex-1 min-w-0">
                      <div class="font-medium">{analyzer.label}</div>
                      <div class="text-xs text-white/50 mt-1 flex flex-wrap gap-2">
                        <span class="px-2 py-0.5 bg-white/10 rounded">FFT: {analyzer.fftSize}</span>
                        <span class="px-2 py-0.5 bg-white/10 rounded">Smooth: {analyzer.smoothing}</span>
                        <span class="px-2 py-0.5 bg-white/10 rounded">Gain: {analyzer.gain}x</span>
                        {#if analyzer.normalization}
                          <span class="px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded">Normalized</span>
                        {/if}
                      </div>
                      <div class="text-xs text-white/40 mt-1 truncate">
                        Device: {getDeviceLabel(analyzer.deviceId)}
                      </div>
                    </div>
                    <div class="flex gap-1">
                      <Button variant="ghost" size="sm" onclick={() => startEditing(analyzer)}>
                        <Pencil class="size-4 text-white/60" />
                      </Button>
                      <Button variant="ghost" size="sm" onclick={() => removeAnalyzer(analyzer.id)}>
                        <Trash2 class="size-4 text-red-400" />
                      </Button>
                    </div>
                  </div>
                {/if}
              </div>
            {/each}
          </div>
        {/if}
      </section>
    {/if}
  </div>
</div>
