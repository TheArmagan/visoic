<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import {
    Background,
    BackgroundVariant,
    SvelteFlow,
    Controls,
    MiniMap,
    type Connection,
    type IsValidConnection,
  } from "@xyflow/svelte";
  import "@xyflow/svelte/dist/style.css";

  import {
    dynamicNodeTypes,
    syncNodeTypesWithRegistry,
  } from "$lib/components/nodes/node-types";
  import NodeSearchPopup from "$lib/components/nodes/NodeSearchPopup.svelte";
  import {
    nodeGraph,
    nodeRuntime,
    nodeRegistry,
    loadISFShaders,
    type VisoicNode,
    type VisoicEdge,
    isConnectionValid as checkConnectionValid,
  } from "$lib/api/nodes";
  import {
    useNodeOperations,
    useEdgeOperations,
    useGraphSerialization,
  } from "$lib/api/nodes/hooks.svelte";
  import { Button } from "$lib/components/ui/button";

  // State - use any to bypass strict SvelteFlow type checking
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let nodes = $state.raw<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let edges = $state.raw<any[]>([]);

  // Initialize nodes/edges with type sync
  {
    const initialNodes = nodeGraph.getNodes();
    syncNodeTypesWithRegistry(initialNodes.map((n) => n.type));
    nodes = initialNodes;
    edges = nodeGraph.getEdges();
  }

  // Runtime state
  let isInitialized = $state(false);
  let isRunning = $state(false);
  let frameCount = $state(0);
  let currentTime = $state(0);

  // Search popup state
  let showSearchPopup = $state(false);
  let searchPopupPosition = $state({ x: 0, y: 0 });
  let pendingConnectionSource = $state<{
    nodeId: string;
    handleId: string | null;
  } | null>(null);

  // Hooks
  const nodeOps = useNodeOperations();
  const edgeOps = useEdgeOperations();
  const serialization = useGraphSerialization();

  // Store cleanup function
  let statsInterval: ReturnType<typeof setInterval> | null = null;

  // Initialize runtime
  onMount(() => {
    // Initialize async but don't block mount
    nodeRuntime.initialize().then(async () => {
      // Load ISF shaders into the node registry
      const isfCount = await loadISFShaders();
      console.log(`[NodeEditor] Loaded ${isfCount} ISF shaders`);

      // Sync all registered node types with SvelteFlow nodeTypes map
      const allTypes = nodeRegistry.getAll().map((d) => d.type);
      syncNodeTypesWithRegistry(allTypes);
      console.log(
        `[NodeEditor] Synced ${allTypes.length} node types with SvelteFlow`,
      );

      isInitialized = true;

      // Start runtime automatically
      nodeRuntime.start();
      isRunning = true;
    });

    // Update stats periodically
    statsInterval = setInterval(() => {
      if (nodeRuntime.running) {
        frameCount = nodeRuntime.currentFrame;
        currentTime = nodeRuntime.currentTime;
      }
    }, 100);
  });

  onDestroy(() => {
    // Cleanup interval
    if (statsInterval) {
      clearInterval(statsInterval);
    }
    // Don't stop runtime on destroy - keep it running
  });

  // Subscribe to graph changes
  nodeGraph.subscribe(() => {
    const currentNodes = nodeGraph.getNodes();
    // Ensure all node types are registered before updating state
    syncNodeTypesWithRegistry(currentNodes.map((n) => n.type));
    nodes = currentNodes;
    edges = nodeGraph.getEdges();
  });

  // Toggle runtime
  function toggleRuntime() {
    if (nodeRuntime.running) {
      nodeRuntime.stop();
      isRunning = false;
    } else {
      nodeRuntime.start();
      isRunning = true;
    }
  }

  // Connection validation
  const isValidConnection: IsValidConnection = (connection) => {
    return edgeOps.isValidConnection(connection as any);
  };

  // Handle new connections
  function onConnect(connection: Connection) {
    edgeOps.addEdge({
      source: connection.source,
      target: connection.target,
      sourceHandle: connection.sourceHandle ?? null,
      targetHandle: connection.targetHandle ?? null,
    });
  }

  // Handle edge deletion
  function onDelete({
    nodes: deletedNodes,
    edges: deletedEdges,
  }: {
    nodes: { id: string }[];
    edges: { id: string }[];
  }) {
    for (const edge of deletedEdges) {
      edgeOps.removeEdge(edge.id);
    }
    for (const node of deletedNodes) {
      nodeOps.removeNode(node.id);
    }
  }

  // Handle node position changes
  function onNodeDragStop({
    targetNode,
  }: {
    targetNode: { id: string; position: { x: number; y: number } };
  }) {
    nodeOps.updateNode(targetNode.id, { position: targetNode.position });
  }

  // Handle double click to add node
  function handlePaneDoubleClick(event: MouseEvent) {
    searchPopupPosition = {
      x: event.clientX,
      y: event.clientY,
    };
    pendingConnectionSource = null;
    showSearchPopup = true;
  }

  // Handle connection end without target (show popup)
  function onConnectEnd(event: MouseEvent | TouchEvent, connectionState: any) {
    if (!connectionState.isValid && connectionState.fromNode) {
      const clientX =
        "clientX" in event ? event.clientX : event.touches[0].clientX;
      const clientY =
        "clientY" in event ? event.clientY : event.touches[0].clientY;

      searchPopupPosition = { x: clientX, y: clientY };
      pendingConnectionSource = {
        nodeId: connectionState.fromNode.id,
        handleId: connectionState.fromHandle?.id ?? null,
      };
      showSearchPopup = true;
    }
  }

  // Handle node selection from popup
  function handleNodeSelect(type: string) {
    // Convert screen position to flow position
    // Simple offset for now - in production you'd use screenToFlowPosition
    const node = nodeOps.addNode(type, {
      x: searchPopupPosition.x - 100,
      y: searchPopupPosition.y - 50,
    });

    // If we have a pending connection, try to connect
    if (node && pendingConnectionSource) {
      const sourceNode = nodeGraph.getNode(pendingConnectionSource.nodeId);
      if (sourceNode && pendingConnectionSource.handleId) {
        // Try to find a compatible input on the new node
        const sourceHandle = sourceNode.data.outputs.find(
          (h) => h.id === pendingConnectionSource!.handleId,
        );

        if (sourceHandle) {
          // Find first compatible input
          const targetHandle = node.data.inputs.find((input) => {
            const validation = checkConnectionValid(sourceHandle, input);
            return validation.isValid;
          });

          if (targetHandle) {
            edgeOps.addEdge({
              source: pendingConnectionSource.nodeId,
              target: node.id,
              sourceHandle: pendingConnectionSource.handleId,
              targetHandle: targetHandle.id,
            });
          }
        }
      }
    }

    showSearchPopup = false;
    pendingConnectionSource = null;
  }

  function handleClosePopup() {
    showSearchPopup = false;
    pendingConnectionSource = null;
  }

  // Keyboard shortcuts
  function handleKeydown(event: KeyboardEvent) {
    // Save/Load shortcuts
    if (event.ctrlKey || event.metaKey) {
      if (event.key === "s") {
        event.preventDefault();
        serialization.exportToFile();
      } else if (event.key === "o") {
        event.preventDefault();
        serialization.importFromFile();
      }
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div
  class="w-screen h-[calc(100vh-3rem)] relative"
  style="--background-color: #0a0a0a;"
>
  <!-- Toolbar -->
  <div class="absolute top-4 left-4 z-10 flex items-center gap-2">
    <Button
      variant="outline"
      size="sm"
      onclick={toggleRuntime}
      class="bg-neutral-900/80 backdrop-blur-sm border-neutral-700"
    >
      {isRunning ? "⏹️ Stop" : "▶️ Play"}
    </Button>

    <Button
      variant="outline"
      size="sm"
      onclick={() => serialization.clear()}
      class="bg-neutral-900/80 backdrop-blur-sm border-neutral-700"
    >
      🗑️ Clear
    </Button>

    <Button
      variant="outline"
      size="sm"
      onclick={() => serialization.exportToFile()}
      class="bg-neutral-900/80 backdrop-blur-sm border-neutral-700"
    >
      💾 Save
    </Button>

    <Button
      variant="outline"
      size="sm"
      onclick={() => serialization.importFromFile()}
      class="bg-neutral-900/80 backdrop-blur-sm border-neutral-700"
    >
      📂 Load
    </Button>
  </div>

  <!-- Stats -->
  <div
    class="absolute top-4 right-4 z-10 px-3 py-2 bg-neutral-900/80 backdrop-blur-sm border border-neutral-700 rounded-lg text-xs text-neutral-400 space-y-1"
  >
    <div>Nodes: {nodes.length}</div>
    <div>Edges: {edges.length}</div>
    {#if isRunning}
      <div class="text-green-400">Runtime: Active</div>
      <div class="text-green-400">Frame: {frameCount}</div>
      <div class="text-green-400">Time: {currentTime.toFixed(2)}s</div>
    {:else}
      <div class="text-yellow-400">Runtime: Stopped</div>
    {/if}
  </div>

  <!-- Main Flow -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="w-full h-full" ondblclickcapture={handlePaneDoubleClick}>
    <SvelteFlow
      {nodes}
      {edges}
      nodeTypes={dynamicNodeTypes}
      {isValidConnection}
      onconnect={onConnect}
      ondelete={onDelete}
      onnodedragstop={onNodeDragStop}
      onconnectend={onConnectEnd}
      colorMode="dark"
      fitView
      deleteKey={["Delete", "Backspace"]}
      connectionLineStyle="stroke: #888; stroke-width: 2;"
      defaultEdgeOptions={{
        style: "stroke: #888; stroke-width: 2;",
      }}
    >
      <Background bgColor="#0a0a0a" variant={BackgroundVariant.Dots} gap={16} />
      <Controls class="bg-neutral-900! border-neutral-700! rounded-lg!" />
      <MiniMap
        class="bg-neutral-900! border-neutral-700! rounded-lg!"
        nodeColor={(node) => {
          const category = (node.data as any)?.category;
          switch (category) {
            case "shader":
              return "#8b5cf6";
            case "math":
              return "#22c55e";
            case "value":
              return "#3b82f6";
            case "audio":
              return "#f97316";
            case "logic":
              return "#ef4444";
            case "utility":
              return "#a3a3a3";
            case "output":
              return "#14b8a6";
            default:
              return "#525252";
          }
        }}
      />
    </SvelteFlow>
  </div>

  <!-- Search Popup -->
  {#if showSearchPopup}
    <NodeSearchPopup
      position={searchPopupPosition}
      onSelect={handleNodeSelect}
      onClose={handleClosePopup}
    />
  {/if}
</div>

<style>
  :global(.svelte-flow) {
    --xy-node-border-radius: 8px;
    --xy-node-background-color: transparent;
  }

  :global(.svelte-flow__node) {
    padding: 0 !important;
    border: none !important;
    background: transparent !important;
  }

  :global(.svelte-flow__edge-path) {
    stroke-width: 2;
  }

  :global(.svelte-flow__edge.selected .svelte-flow__edge-path) {
    stroke: #fff;
    stroke-width: 3;
  }

  :global(.svelte-flow__connection-line) {
    stroke: #888;
    stroke-width: 2;
    stroke-dasharray: 5, 5;
  }
</style>
