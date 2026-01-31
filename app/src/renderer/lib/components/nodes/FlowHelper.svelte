<script lang="ts">
  import { useSvelteFlow } from "@xyflow/svelte";
  import { onMount } from "svelte";
  import { setNodeEditorContext, type NodeEditorContext } from "./node-context";
  import type { HandleDefinition } from "$lib/api/nodes/types";

  interface Props {
    onInit: (instance: ReturnType<typeof useSvelteFlow>) => void;
    onOutputHandleDoubleClick?: (nodeId: string, handle: HandleDefinition, event: MouseEvent) => void;
  }

  let { onInit, onOutputHandleDoubleClick }: Props = $props();

  const instance = useSvelteFlow();

  // Set context for child nodes
  setNodeEditorContext({
    onOutputHandleDoubleClick
  });

  onMount(() => {
    onInit(instance);
  });
</script>
