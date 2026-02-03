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

  function handleInput(e: Event) {
    oninput?.(e);
  }

  function handleChange(e: Event) {
    onchange?.(e);
  }
</script>

<input
  bind:this={inputRef}
  type="range"
  {value}
  {min}
  {max}
  {step}
  {disabled}
  oninput={handleInput}
  onchange={handleChange}
  class="nodrag w-full h-2 bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-white {className}"
/>
