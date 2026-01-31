<script lang="ts">
  interface Props {
    value: number;
    min?: number;
    max?: number;
    step?: number;
    disabled?: boolean;
    class?: string;
    oninput?: (e: Event) => void;
    onchange?: (e: Event) => void;
  }

  let {
    value,
    min = 0,
    max = 1,
    step = 0.01,
    disabled = false,
    class: className = "",
    oninput,
    onchange,
  }: Props = $props();

  let inputRef = $state<HTMLInputElement | null>(null);

  // Keep the input in sync with the value prop
  $effect(() => {
    if (inputRef && document.activeElement !== inputRef) {
      inputRef.value = String(value);
    }
  });
</script>

<input
  bind:this={inputRef}
  type="range"
  value={value}
  {min}
  {max}
  {step}
  {disabled}
  {oninput}
  {onchange}
  class="nodrag w-full h-2 bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-white {className}"
/>
