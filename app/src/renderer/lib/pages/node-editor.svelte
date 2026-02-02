<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import {
    Background,
    BackgroundVariant,
    SvelteFlow,
    Controls,
    MiniMap,
    useSvelteFlow,
    type Connection,
    type IsValidConnection,
  } from "@xyflow/svelte";
  import "@xyflow/svelte/dist/style.css";

  import {
    dynamicNodeTypes,
    syncNodeTypesWithRegistry,
  } from "$lib/components/nodes/node-types";
  import NodeSearchPopup from "$lib/components/nodes/NodeSearchPopup.svelte";
  import FlowHelper from "$lib/components/nodes/FlowHelper.svelte";
  import {
    nodeGraph,
    nodeRuntime,
    nodeRegistry,
    loadISFShaders,
    type VisoicNode,
    type VisoicEdge,
    isConnectionValid as checkConnectionValid,
    getLayoutedElements,
    layoutPresets,
    type LayoutDirection,
    DATA_TYPE_INFO,
  } from "$lib/api/nodes";
  import {
    useNodeOperations,
    useEdgeOperations,
    useGraphSerialization,
  } from "$lib/api/nodes/hooks.svelte";
  import { Button } from "$lib/components/ui/button";

  // State - use $state.raw as recommended by SvelteFlow for performance
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let nodes = $state.raw<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let edges = $state.raw<any[]>([]);

  // Helper function to apply edge styles based on data type
  function applyEdgeStyles(edgeList: VisoicEdge[]) {
    return edgeList.map((edge) => {
      const dataType = edge.data?.dataType || "any";
      const typeInfo = DATA_TYPE_INFO[dataType as keyof typeof DATA_TYPE_INFO];
      const edgeColor = typeInfo?.color || "#888";
      return {
        ...edge,
        type: "smoothstep",
        style: `stroke: ${edgeColor}; stroke-width: 2;`,
      };
    });
  }

  // Initialize nodes/edges with type sync
  {
    const initialNodes = nodeGraph.getNodes();
    syncNodeTypesWithRegistry(initialNodes.map((n) => n.type));
    nodes = initialNodes;
    edges = applyEdgeStyles(nodeGraph.getEdges());
  }

  // Runtime state
  let isInitialized = $state(false);
  let isRunning = $state(false);
  let frameCount = $state(0);
  let currentTime = $state(0);

  // Search popup state
  let showSearchPopup = $state(false);
  let searchPopupPosition = $state({ x: 0, y: 0 });
  let flowPosition = $state({ x: 0, y: 0 }); // Position in flow coordinates
  let pendingConnectionSource = $state<{
    nodeId: string;
    handleId: string | null;
  } | null>(null);

  // Copy/paste state
  let clipboard = $state<{ nodes: VisoicNode[]; edges: VisoicEdge[] } | null>(
    null,
  );
  let lastPastePosition = $state({ x: 0, y: 0 });

  // Context menu state
  let contextMenuNode = $state<string | null>(null);
  let contextMenuPosition = $state({ x: 0, y: 0 });

  // Layout menu state
  let showLayoutMenu = $state(false);

  // Auto-save state
  let autoSaveEnabled = $state(false);
  let autoSaveInterval: ReturnType<typeof setInterval> | null = null;
  const AUTO_SAVE_INTERVAL_MS = 60000; // 1 minute

  // SvelteFlow instance (will be set by FlowHelper)
  let svelteFlowInstance: ReturnType<typeof useSvelteFlow> | null = null;

  // Interaction state - used to skip heavy updates during zoom/drag
  let isInteracting = $state(false);
  let graphSyncTimer: ReturnType<typeof setTimeout> | null = null;

  // Track node positions changed by UI to prevent sync override
  let pendingPositionUpdates = new Map<string, { x: number; y: number }>();
  let lastSyncTime = 0;

  // Hooks
  const nodeOps = useNodeOperations();
  const edgeOps = useEdgeOperations();
  const serialization = useGraphSerialization();

  // Store cleanup function
  let statsInterval: ReturnType<typeof setInterval> | null = null;

  // Force UI refresh counter - used to trigger reactive updates
  let forceRefreshCounter = $state(0);

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

    // Update stats periodically - also forces UI reactivity for realtime values
    statsInterval = setInterval(() => {
      if (nodeRuntime.running) {
        frameCount = nodeRuntime.currentFrame;
        currentTime = nodeRuntime.currentTime;
        // Increment counter to trigger any derived computations
        forceRefreshCounter++;
      }
    }, 50); // 20fps for stats update
  });

  onDestroy(() => {
    // Cleanup interval
    if (statsInterval) {
      clearInterval(statsInterval);
    }
    if (graphSyncTimer) {
      clearTimeout(graphSyncTimer);
    }
    if (autoSaveInterval) {
      clearInterval(autoSaveInterval);
    }
    // Don't stop runtime on destroy - keep it running
  });

  // Toggle auto-save
  function toggleAutoSave() {
    autoSaveEnabled = !autoSaveEnabled;

    if (autoSaveEnabled) {
      // Start auto-save interval
      autoSaveInterval = setInterval(() => {
        // Only auto-save if there's a saved file path (user has saved at least once)
        if (serialization.currentFilePath) {
          serialization.exportToFile();
          console.log("[AutoSave] Saved at", new Date().toLocaleTimeString());
        }
      }, AUTO_SAVE_INTERVAL_MS);
      console.log("[AutoSave] Enabled - saving every minute");
    } else {
      // Stop auto-save interval
      if (autoSaveInterval) {
        clearInterval(autoSaveInterval);
        autoSaveInterval = null;
      }
      console.log("[AutoSave] Disabled");
    }
  }

  // Debounced graph sync function
  function syncNodesFromGraph(forceFullSync = false) {
    const currentNodes = nodeGraph.getNodes();
    // Ensure all node types are registered before updating state
    syncNodeTypesWithRegistry(currentNodes.map((n) => n.type));

    // Create map of current UI nodes to preserve selection/drag state
    const uiNodeMap = new Map(nodes.map((n) => [n.id, n]));

    // Check if this is just a data update (no structural changes)
    const isStructuralChange =
      currentNodes.length !== nodes.length ||
      currentNodes.some((n) => !uiNodeMap.has(n.id));

    const newNodes = currentNodes.map((graphNode) => {
      const uiNode = uiNodeMap.get(graphNode.id);

      // Check for pending position update from UI
      const pendingPos = pendingPositionUpdates.get(graphNode.id);

      if (uiNode) {
        // Determine which position to use
        let position = graphNode.position;

        // If there's a pending position update or node is being dragged, use UI position
        if (pendingPos) {
          position = pendingPos;
        } else if (uiNode.dragging) {
          position = uiNode.position;
        } else if (!forceFullSync && !isStructuralChange) {
          // For data-only updates, keep UI position to prevent jumps
          position = uiNode.position;
        }

        return {
          ...graphNode,
          // Preserve UI-only state from Svelte Flow
          selected: uiNode.selected,
          dragging: uiNode.dragging,
          resizing: uiNode.resizing,
          // Svelte Flow internal dimensions
          measured: uiNode.measured,
          width: uiNode.width,
          height: uiNode.height,
          position,
        };
      }
      return graphNode;
    });

    // Only update if there are actual changes
    nodes = newNodes;

    // Preserve edge selection state and add colors based on data type
    const currentEdges = nodeGraph.getEdges();
    const uiEdgeMap = new Map(edges.map((e) => [e.id, e]));

    const isEdgeStructuralChange =
      currentEdges.length !== edges.length ||
      currentEdges.some((e) => !uiEdgeMap.has(e.id));

    if (isEdgeStructuralChange || forceFullSync) {
      edges = currentEdges.map((graphEdge) => {
        const uiEdge = uiEdgeMap.get(graphEdge.id);
        const isSelected = uiEdge?.selected || false;
        // Get color from data type
        const dataType = graphEdge.data?.dataType || "any";
        const typeInfo =
          DATA_TYPE_INFO[dataType as keyof typeof DATA_TYPE_INFO];
        const edgeColor = typeInfo?.color || "#888";

        return {
          ...graphEdge,
          selected: isSelected,
          type: "smoothstep",
          style: `stroke: ${edgeColor}; stroke-width: ${isSelected ? 3 : 2};`,
          animated: isSelected,
        };
      });
    }

    lastSyncTime = Date.now();
  }

  // Subscribe to graph changes - debounced during interaction
  nodeGraph.subscribe(() => {
    // Skip sync during active interaction (zoom/drag) to prevent preview freeze
    if (isInteracting) {
      // Schedule sync for after interaction ends
      if (graphSyncTimer) clearTimeout(graphSyncTimer);
      graphSyncTimer = setTimeout(() => {
        if (!isInteracting) {
          syncNodesFromGraph();
        }
      }, 100);
      return;
    }

    // Debounce rapid updates
    if (graphSyncTimer) clearTimeout(graphSyncTimer);
    graphSyncTimer = setTimeout(() => {
      syncNodesFromGraph();
    }, 16); // ~60fps
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

  // Handle node drag start - track the node being dragged
  function onNodeDragStart({
    targetNode,
  }: {
    targetNode: { id: string; position: { x: number; y: number } };
  }) {
    isInteracting = true;
    // Store the position as pending to prevent sync from overriding it
    pendingPositionUpdates.set(targetNode.id, { ...targetNode.position });
  }

  // Handle node drag - update pending position
  function onNodeDrag({
    targetNode,
  }: {
    targetNode: { id: string; position: { x: number; y: number } };
  }) {
    pendingPositionUpdates.set(targetNode.id, { ...targetNode.position });
  }

  // Handle node position changes
  function onNodeDragStop({
    targetNode,
  }: {
    targetNode: { id: string; position: { x: number; y: number } };
  }) {
    isInteracting = false;

    // Update graph with final position
    nodeOps.updateNode(targetNode.id, { position: targetNode.position });

    // Clear pending after a short delay to ensure sync doesn't override
    setTimeout(() => {
      pendingPositionUpdates.delete(targetNode.id);
    }, 100);
  }

  // Pane context menu state
  let showPaneContextMenu = $state(false);
  let paneContextMenuPosition = $state({ x: 0, y: 0 });

  // Handle pane context menu (right click on empty area)
  function handlePaneContextMenu(event: MouseEvent) {
    event.preventDefault();
    paneContextMenuPosition = { x: event.clientX, y: event.clientY };
    // Calculate flow position for potential node creation
    if (svelteFlowInstance) {
      flowPosition = svelteFlowInstance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });
    } else {
      flowPosition = { x: event.clientX - 100, y: event.clientY - 50 };
    }
    showPaneContextMenu = true;
    // Close node context menu if open
    contextMenuNode = null;
  }

  // Open node search from pane context menu
  function openNodeSearchFromMenu() {
    searchPopupPosition = paneContextMenuPosition;
    pendingConnectionSource = null;
    showSearchPopup = true;
    showPaneContextMenu = false;
  }

  // Paste from pane context menu
  function pasteFromMenu() {
    pasteNodes();
    showPaneContextMenu = false;
  }

  // Handle output handle double click - open node search popup
  function handleOutputHandleDoubleClick(
    nodeId: string,
    handle: any,
    event: MouseEvent,
  ) {
    searchPopupPosition = { x: event.clientX, y: event.clientY };
    // Calculate flow position
    if (svelteFlowInstance) {
      flowPosition = svelteFlowInstance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });
    } else {
      flowPosition = { x: event.clientX - 100, y: event.clientY - 50 };
    }
    pendingConnectionSource = {
      nodeId: nodeId,
      handleId: handle.id,
    };
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
      // Calculate flow position
      if (svelteFlowInstance) {
        flowPosition = svelteFlowInstance.screenToFlowPosition({
          x: clientX,
          y: clientY,
        });
      } else {
        flowPosition = { x: clientX - 100, y: clientY - 50 };
      }
      pendingConnectionSource = {
        nodeId: connectionState.fromNode.id,
        handleId: connectionState.fromHandle?.id ?? null,
      };
      showSearchPopup = true;
    }
  }

  // Handle node selection from popup
  function handleNodeSelect(type: string) {
    // Use flow position calculated when popup was opened
    const node = nodeOps.addNode(type, flowPosition);

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

  // Copy selected nodes
  function copySelectedNodes() {
    const selectedNodes = nodes.filter((n) => n.selected);
    if (selectedNodes.length === 0) return;

    // Get edges between selected nodes
    const selectedNodeIds = new Set(selectedNodes.map((n) => n.id));
    const selectedEdges = edges.filter(
      (e) => selectedNodeIds.has(e.source) && selectedNodeIds.has(e.target),
    );

    clipboard = {
      nodes: JSON.parse(JSON.stringify(selectedNodes)),
      edges: JSON.parse(JSON.stringify(selectedEdges)),
    };

    // Reset paste position
    lastPastePosition = { x: 0, y: 0 };
  }

  // Paste nodes from clipboard
  function pasteNodes() {
    if (!clipboard || clipboard.nodes.length === 0) return;

    // Calculate offset for paste position
    const offset = { x: lastPastePosition.x + 50, y: lastPastePosition.y + 50 };
    lastPastePosition = offset;

    // Find min position in clipboard to calculate relative positions
    const minX = Math.min(...clipboard.nodes.map((n) => n.position.x));
    const minY = Math.min(...clipboard.nodes.map((n) => n.position.y));

    // Create ID mapping for new nodes
    const idMap = new Map<string, string>();

    // Add nodes with new IDs and offset positions
    for (const node of clipboard.nodes) {
      const newId = `${node.type.replace(":", "_")}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      idMap.set(node.id, newId);

      const newPosition = {
        x: node.position.x - minX + offset.x,
        y: node.position.y - minY + offset.y,
      };

      // Deep clone the data
      const newData = JSON.parse(JSON.stringify(node.data));

      // Add to graph
      nodeGraph.addNodeInstance({
        id: newId,
        type: node.type,
        position: newPosition,
        data: newData,
      } as VisoicNode);
    }

    // Add edges with updated IDs
    for (const edge of clipboard.edges) {
      const newSource = idMap.get(edge.source);
      const newTarget = idMap.get(edge.target);

      if (newSource && newTarget) {
        edgeOps.addEdge({
          source: newSource,
          target: newTarget,
          sourceHandle: edge.sourceHandle,
          targetHandle: edge.targetHandle,
        });
      }
    }
  }

  // Duplicate a specific node
  function duplicateNode(nodeId: string) {
    const node = nodeGraph.getNode(nodeId);
    if (!node) return;

    const newId = `${node.type.replace(":", "_")}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const newPosition = {
      x: node.position.x + 50,
      y: node.position.y + 50,
    };

    const newData = JSON.parse(JSON.stringify(node.data));

    nodeGraph.addNodeInstance({
      id: newId,
      type: node.type,
      position: newPosition,
      data: newData,
    } as VisoicNode);
  }

  // Delete a specific node
  function deleteNode(nodeId: string) {
    nodeOps.removeNode(nodeId);
  }

  // Handle node context menu
  function handleNodeContextMenu(event: MouseEvent, nodeId: string) {
    event.preventDefault();
    event.stopPropagation();
    contextMenuNode = nodeId;
    contextMenuPosition = { x: event.clientX, y: event.clientY };
  }

  // Apply layout to nodes
  function applyLayout(direction: LayoutDirection) {
    // Use UI nodes state which has measured dimensions from SvelteFlow
    const currentNodes = nodes;
    const currentEdges = edges;

    console.log("[Layout] Applying layout:", direction);
    console.log("[Layout] Current nodes:", currentNodes.length);
    console.log("[Layout] Current edges:", currentEdges.length);

    if (currentNodes.length === 0) {
      console.log("[Layout] No nodes to layout");
      return;
    }

    // Log measured dimensions for debugging
    for (const node of currentNodes) {
      console.log(
        "[Layout] Node",
        node.id,
        "measured:",
        node.measured,
        "width/height:",
        node.width,
        node.height,
      );
    }

    // Get layouted elements
    const { nodes: layoutedNodes } = getLayoutedElements(
      currentNodes as VisoicNode[],
      currentEdges as VisoicEdge[],
      { direction },
    );

    console.log("[Layout] Layouted nodes:", layoutedNodes);

    // Update node positions in graph AND in local state
    for (const layoutedNode of layoutedNodes) {
      console.log(
        "[Layout] Updating node:",
        layoutedNode.id,
        layoutedNode.position,
      );
      nodeGraph.updateNode(layoutedNode.id, {
        position: layoutedNode.position,
      });
    }

    // Directly update local nodes state for immediate UI update
    nodes = currentNodes.map((n) => {
      const layoutedNode = layoutedNodes.find((ln) => ln.id === n.id);
      return layoutedNode ? { ...n, position: layoutedNode.position } : n;
    });

    // Fit view after layout
    setTimeout(() => {
      svelteFlowInstance?.fitView({ padding: 0.2 });
    }, 100);

    showLayoutMenu = false;
  }

  // Apply layout preset
  function applyLayoutPreset(preset: keyof typeof layoutPresets) {
    // Use UI nodes state which has measured dimensions from SvelteFlow
    const currentNodes = nodes;
    const currentEdges = edges;

    console.log("[Layout] Applying preset:", preset);

    if (currentNodes.length === 0) {
      console.log("[Layout] No nodes to layout");
      return;
    }

    const options = layoutPresets[preset];

    // Get layouted elements
    const { nodes: layoutedNodes } = getLayoutedElements(
      currentNodes as VisoicNode[],
      currentEdges as VisoicEdge[],
      options,
    );

    console.log("[Layout] Layouted nodes:", layoutedNodes);

    // Update node positions in graph
    for (const layoutedNode of layoutedNodes) {
      nodeGraph.updateNode(layoutedNode.id, {
        position: layoutedNode.position,
      });
    }

    // Directly update local nodes state for immediate UI update
    nodes = currentNodes.map((n) => {
      const layoutedNode = layoutedNodes.find((ln) => ln.id === n.id);
      return layoutedNode ? { ...n, position: layoutedNode.position } : n;
    });

    // Fit view after layout
    setTimeout(() => {
      svelteFlowInstance?.fitView({ padding: 0.2 });
    }, 100);

    showLayoutMenu = false;
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
      } else if (event.key === "c") {
        event.preventDefault();
        copySelectedNodes();
      } else if (event.key === "v") {
        event.preventDefault();
        pasteNodes();
      } else if (event.key === "d") {
        event.preventDefault();
        // Duplicate selected nodes
        const selectedNodes = nodes.filter((n) => n.selected);
        for (const node of selectedNodes) {
          duplicateNode(node.id);
        }
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

    <Button
      variant="outline"
      size="sm"
      onclick={toggleAutoSave}
      class="bg-neutral-900/80 backdrop-blur-sm border-neutral-700 {autoSaveEnabled
        ? 'border-green-500 text-green-400'
        : ''}"
      title={autoSaveEnabled
        ? "Auto-save enabled (every 1 min)"
        : "Enable auto-save"}
    >
      {autoSaveEnabled ? "🔄 Auto" : "⏸️ Auto"}
    </Button>

    <!-- Layout Button with Dropdown -->
    <div class="relative">
      <Button
        variant="outline"
        size="sm"
        onclick={() => (showLayoutMenu = !showLayoutMenu)}
        class="bg-neutral-900/80 backdrop-blur-sm border-neutral-700"
      >
        📐 Layout
      </Button>

      {#if showLayoutMenu}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="fixed inset-0 z-40"
          onclick={() => (showLayoutMenu = false)}
        ></div>
        <div
          class="absolute top-full left-0 mt-1 z-50 min-w-[180px] rounded-md border border-neutral-700 bg-neutral-900 p-1 shadow-lg"
        >
          <div class="px-2 py-1.5 text-xs text-neutral-500 font-semibold">
            Direction
          </div>
          <button
            class="w-full flex items-center gap-2 px-2 py-1.5 text-sm text-neutral-200 rounded hover:bg-neutral-800 cursor-pointer"
            onclick={() => applyLayout("TB")}
          >
            <span>⬇️</span>
            <span>Top to Bottom</span>
          </button>
          <button
            class="w-full flex items-center gap-2 px-2 py-1.5 text-sm text-neutral-200 rounded hover:bg-neutral-800 cursor-pointer"
            onclick={() => applyLayout("BT")}
          >
            <span>⬆️</span>
            <span>Bottom to Top</span>
          </button>
          <button
            class="w-full flex items-center gap-2 px-2 py-1.5 text-sm text-neutral-200 rounded hover:bg-neutral-800 cursor-pointer"
            onclick={() => applyLayout("LR")}
          >
            <span>➡️</span>
            <span>Left to Right</span>
          </button>
          <button
            class="w-full flex items-center gap-2 px-2 py-1.5 text-sm text-neutral-200 rounded hover:bg-neutral-800 cursor-pointer"
            onclick={() => applyLayout("RL")}
          >
            <span>⬅️</span>
            <span>Right to Left</span>
          </button>

          <div class="h-px bg-neutral-700 my-1"></div>
          <div class="px-2 py-1.5 text-xs text-neutral-500 font-semibold">
            Presets
          </div>
          <button
            class="w-full flex items-center gap-2 px-2 py-1.5 text-sm text-neutral-200 rounded hover:bg-neutral-800 cursor-pointer"
            onclick={() => applyLayoutPreset("compact")}
          >
            <span>📦</span>
            <span>Compact</span>
          </button>
          <button
            class="w-full flex items-center gap-2 px-2 py-1.5 text-sm text-neutral-200 rounded hover:bg-neutral-800 cursor-pointer"
            onclick={() => applyLayoutPreset("spread")}
          >
            <span>🔲</span>
            <span>Spread Out</span>
          </button>
          <button
            class="w-full flex items-center gap-2 px-2 py-1.5 text-sm text-neutral-200 rounded hover:bg-neutral-800 cursor-pointer"
            onclick={() => applyLayoutPreset("horizontal")}
          >
            <span>↔️</span>
            <span>Horizontal Flow</span>
          </button>
        </div>
      {/if}
    </div>
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
  <div class="w-full h-full">
    <SvelteFlow
      bind:nodes
      bind:edges
      nodeTypes={dynamicNodeTypes}
      {isValidConnection}
      onconnect={onConnect}
      ondelete={onDelete}
      onnodedragstart={onNodeDragStart}
      onnodedrag={onNodeDrag}
      onnodedragstop={onNodeDragStop}
      onmovestart={() => (isInteracting = true)}
      onmoveend={() => {
        isInteracting = false;
        // Trigger sync after interaction ends
        syncNodesFromGraph();
      }}
      onedgeclick={(event) => {
        // Toggle animation on clicked edge
        const clickedEdgeId = event.edge.id;
        edges = edges.map((edge) => {
          const isClicked = edge.id === clickedEdgeId;
          const dataType = edge.data?.dataType || "any";
          const typeInfo =
            DATA_TYPE_INFO[dataType as keyof typeof DATA_TYPE_INFO];
          const edgeColor = typeInfo?.color || "#888";
          return {
            ...edge,
            selected: isClicked,
            style: `stroke: ${edgeColor}; stroke-width: ${isClicked ? 3 : 2};`,
            animated: isClicked,
          };
        });
      }}
      onpaneclick={() => {
        // Deselect all edges when clicking on pane
        edges = edges.map((edge) => {
          const dataType = edge.data?.dataType || "any";
          const typeInfo =
            DATA_TYPE_INFO[dataType as keyof typeof DATA_TYPE_INFO];
          const edgeColor = typeInfo?.color || "#888";
          return {
            ...edge,
            selected: false,
            style: `stroke: ${edgeColor}; stroke-width: 2;`,
            animated: false,
          };
        });
      }}
      onconnectend={onConnectEnd}
      onnodecontextmenu={(event) => {
        handleNodeContextMenu(event.event, event.node.id);
      }}
      onpanecontextmenu={(event) => {
        handlePaneContextMenu(event.event);
      }}
      colorMode="dark"
      fitView
      zoomOnDoubleClick={false}
      deleteKey={["Delete", "Backspace"]}
      connectionLineStyle="stroke: #888; stroke-width: 2;"
      defaultEdgeOptions={{
        type: "smoothstep",
        style: "stroke: #888; stroke-width: 2;",
      }}
    >
      <Background bgColor="#0a0a0a" variant={BackgroundVariant.Dots} gap={16} />
      <Controls class="bg-neutral-900! border-neutral-700! rounded-lg!" />
      <FlowHelper
        onInit={(instance) => (svelteFlowInstance = instance)}
        onOutputHandleDoubleClick={handleOutputHandleDoubleClick}
      />
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

  <!-- Node Context Menu -->
  {#if contextMenuNode}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="fixed inset-0 z-40"
      onclick={() => (contextMenuNode = null)}
    ></div>
    <div
      class="fixed z-50 min-w-[160px] rounded-md border border-neutral-700 bg-neutral-900 p-1 shadow-lg"
      style="left: {contextMenuPosition.x}px; top: {contextMenuPosition.y}px;"
    >
      <button
        class="w-full flex items-center gap-2 px-2 py-1.5 text-sm text-neutral-200 rounded hover:bg-neutral-800 cursor-pointer"
        onclick={() => {
          duplicateNode(contextMenuNode!);
          contextMenuNode = null;
        }}
      >
        <span>📋</span>
        <span>Duplicate</span>
        <span class="ml-auto text-xs text-neutral-500">Ctrl+D</span>
      </button>
      <button
        class="w-full flex items-center gap-2 px-2 py-1.5 text-sm text-neutral-200 rounded hover:bg-neutral-800 cursor-pointer"
        onclick={() => {
          // Select this node and copy
          const node = nodes.find((n) => n.id === contextMenuNode);
          if (node) {
            clipboard = {
              nodes: [JSON.parse(JSON.stringify(node))],
              edges: [],
            };
            lastPastePosition = { x: 0, y: 0 };
          }
          contextMenuNode = null;
        }}
      >
        <span>📄</span>
        <span>Copy</span>
        <span class="ml-auto text-xs text-neutral-500">Ctrl+C</span>
      </button>
      <div class="h-px bg-neutral-700 my-1"></div>
      <button
        class="w-full flex items-center gap-2 px-2 py-1.5 text-sm text-red-400 rounded hover:bg-neutral-800 cursor-pointer"
        onclick={() => {
          deleteNode(contextMenuNode!);
          contextMenuNode = null;
        }}
      >
        <span>🗑️</span>
        <span>Delete</span>
        <span class="ml-auto text-xs text-neutral-500">Del</span>
      </button>
    </div>
  {/if}

  <!-- Pane Context Menu (right click on empty area) -->
  {#if showPaneContextMenu}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="fixed inset-0 z-40"
      onclick={() => (showPaneContextMenu = false)}
    ></div>
    <div
      class="fixed z-50 min-w-[160px] rounded-md border border-neutral-700 bg-neutral-900 p-1 shadow-lg"
      style="left: {paneContextMenuPosition.x}px; top: {paneContextMenuPosition.y}px;"
    >
      <button
        class="w-full flex items-center gap-2 px-2 py-1.5 text-sm text-neutral-200 rounded hover:bg-neutral-800 cursor-pointer"
        onclick={openNodeSearchFromMenu}
      >
        <span>➕</span>
        <span>Add Node</span>
      </button>
      {#if clipboard && clipboard.nodes.length > 0}
        <button
          class="w-full flex items-center gap-2 px-2 py-1.5 text-sm text-neutral-200 rounded hover:bg-neutral-800 cursor-pointer"
          onclick={pasteFromMenu}
        >
          <span>📋</span>
          <span>Paste</span>
          <span class="ml-auto text-xs text-neutral-500">Ctrl+V</span>
        </button>
      {/if}
    </div>
  {/if}

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
