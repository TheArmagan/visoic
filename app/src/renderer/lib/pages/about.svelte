<script lang="ts">
  import { Github, Heart, ExternalLink } from "@lucide/svelte";
  import { onMount } from "svelte";

  let version = $state("...");

  onMount(async () => {
    version = await (window as any).VISOICNative.getVersion();
  });
</script>

<div
  class="w-full h-full flex items-center justify-center bg-gradient-to-br from-black to-zinc-900"
>
  <div class="max-w-lg text-center space-y-8 p-8">
    <div class="space-y-2">
      <h1
        class="text-4xl font-bold bg-gradient-to-r from-purple-400 to-pink-500 bg-clip-text text-transparent"
      >
        Visoic
      </h1>
      <p class="text-white/60 text-sm">v{version}</p>
    </div>

    <div class="space-y-4">
      <p class="text-white/80 text-lg">
        Visualize the unseen world of sound with WebGPU-powered audio
        visualizations.
      </p>
    </div>

    <div class="border border-white/10 rounded-xl p-6 bg-white/5 space-y-4">
      <div class="flex items-center justify-center gap-2 text-white/60">
        <Heart class="size-4 text-red-500" />
        <span>Made with love by</span>
      </div>

      <div class="space-y-2">
        <h2 class="text-xl font-semibold text-white">Kıraç Armağan Önal</h2>
        <button
          onclick={() =>
            (window as any).VISOICNative.openExternal(
              "https://github.com/TheArmagan",
            )}
          class="inline-flex items-center gap-2 text-purple-400 hover:text-purple-300 transition-colors"
        >
          <Github class="size-5" />
          <span>@TheArmagan</span>
          <ExternalLink class="size-3" />
        </button>
      </div>
    </div>

    <div class="text-white/40 text-xs">
      <p>© 2024-2026 Kıraç Armağan Önal. All rights reserved.</p>
    </div>

    <button
      onclick={() =>
        (window as any).VISOICNative.openExternal(
          "https://github.com/TheArmagan",
        )}
      class="inline-flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors text-white/80 cursor-pointer"
    >
      <Github class="size-4" />
      <span>GitHub</span>
      <ExternalLink class="size-3" />
    </button>
  </div>
</div>
