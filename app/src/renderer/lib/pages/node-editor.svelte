<script>
  import { SvelteFlow } from "@xyflow/svelte";
  import "@xyflow/svelte/dist/style.css";

  let nodes = $state.raw([
    { id: "a", data: { label: "node a" }, position: { x: 0, y: 0 } },
    { id: "b", data: { label: "node b" }, position: { x: 0, y: 100 } },
  ]);

  let edges = $state.raw([{ id: "e1-2", source: "1", target: "2" }]);
</script>

<div
  style:width="100vw"
  style:height="calc(100vh - 3rem)"
  style:--background-color="#0a0a0a"
>
  <SvelteFlow bind:nodes bind:edges colorMode="dark" />
</div>
