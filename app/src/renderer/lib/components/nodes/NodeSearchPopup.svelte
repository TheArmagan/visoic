<script lang="ts">
  import { onMount } from "svelte";
  import { Input } from "$lib/components/ui/input";
  import { nodeRegistry } from "$lib/api/nodes/registry";
  import { isfLoader } from "$lib/api/shader";
  import {
    NODE_CATEGORIES,
    type NodeCategory,
    type NodeDefinition,
  } from "$lib/api/nodes/types";
  import { cn } from "$lib/utils";

  interface Props {
    position: { x: number; y: number };
    onSelect: (type: string) => void;
    onClose: () => void;
  }

  let { position, onSelect, onClose }: Props = $props();

  let searchQuery = $state("");
  let selectedIndex = $state(0);
  let inputRef: HTMLInputElement | null = $state(null);
  let expandedCategories = $state<Set<string>>(new Set(["shader"]));
  let expandedSubcategories = $state<Set<string>>(new Set());

  // Track invalid shader IDs for filtering
  let invalidShaderIds = $state<Set<string>>(new Set());
  let validationStarted = $state(false);

  // Start validation when component mounts
  onMount(() => {
    if (!validationStarted && isfLoader.isAvailable()) {
      validationStarted = true;
      // Start validation in background
      isfLoader
        .validateAllShaders((current, total, shaderId) => {
          // Update invalid shaders as validation progresses
          if (isfLoader.isShaderInvalid(shaderId)) {
            invalidShaderIds = new Set([...invalidShaderIds, shaderId]);
          }
        })
        .then((result) => {
          // Final update with all invalid shaders
          invalidShaderIds = new Set(result.invalid.map((s) => s.id));
          console.log(
            `[NodeSearchPopup] Shader validation complete: ${result.valid.length} valid, ${result.invalid.length} invalid`,
          );
        });
    }
  });

  const allNodes = $derived(nodeRegistry.getAll());

  // Filter out invalid ISF shaders from node list
  const validNodes = $derived(() => {
    return allNodes.filter((node) => {
      // Only filter ISF shader nodes that have an isfId
      if (node.isfId && invalidShaderIds.has(node.isfId)) {
        return false;
      }
      return true;
    });
  });

  const filteredNodes = $derived(
    searchQuery.trim()
      ? validNodes().filter(
          (n) =>
            n.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
            n.type.toLowerCase().includes(searchQuery.toLowerCase()) ||
            n.tags?.some((t) =>
              t.toLowerCase().includes(searchQuery.toLowerCase()),
            ),
        )
      : validNodes(),
  );

  // Group nodes by category and subcategory
  interface CategoryGroup {
    category: NodeCategory;
    nodes: NodeDefinition[];
    subcategories: Map<string, NodeDefinition[]>;
  }

  const groupedNodes = $derived(() => {
    const groups = new Map<NodeCategory, CategoryGroup>();

    for (const node of filteredNodes) {
      let group = groups.get(node.category);
      if (!group) {
        group = {
          category: node.category,
          nodes: [],
          subcategories: new Map(),
        };
        groups.set(node.category, group);
      }

      // For shader nodes, extract ISF subcategory
      if (node.category === "shader" && node.type.startsWith("shader:isf:")) {
        const parts = node.type.split(":");
        const subcategory = parts[2] || "Other";

        const existing = group.subcategories.get(subcategory) ?? [];
        existing.push(node);
        group.subcategories.set(subcategory, existing);
      } else {
        group.nodes.push(node);
      }
    }

    return groups;
  });

  // Flat list for keyboard navigation
  const flatList = $derived(() => {
    const list: NodeDefinition[] = [];

    for (const [category, group] of groupedNodes()) {
      const isExpanded = expandedCategories.has(category) || searchQuery.trim();

      if (isExpanded) {
        list.push(...group.nodes);

        for (const [subcat, nodes] of group.subcategories) {
          const subcatKey = `${category}:${subcat}`;
          if (expandedSubcategories.has(subcatKey) || searchQuery.trim()) {
            list.push(...nodes);
          }
        }
      }
    }

    return list;
  });

  function toggleCategory(category: string) {
    const newSet = new Set(expandedCategories);
    if (newSet.has(category)) {
      newSet.delete(category);
    } else {
      newSet.add(category);
    }
    expandedCategories = newSet;
  }

  function toggleSubcategory(key: string) {
    const newSet = new Set(expandedSubcategories);
    if (newSet.has(key)) {
      newSet.delete(key);
    } else {
      newSet.add(key);
    }
    expandedSubcategories = newSet;
  }

  function handleKeydown(e: KeyboardEvent) {
    const list = flatList();
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        selectedIndex = Math.min(selectedIndex + 1, list.length - 1);
        break;
      case "ArrowUp":
        e.preventDefault();
        selectedIndex = Math.max(selectedIndex - 1, 0);
        break;
      case "Enter":
        e.preventDefault();
        if (list[selectedIndex]) {
          onSelect(list[selectedIndex].type);
        }
        break;
      case "Escape":
        e.preventDefault();
        onClose();
        break;
    }
  }

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }

  $effect(() => {
    selectedIndex = 0;
  });

  $effect(() => {
    inputRef?.focus();
  });

  const subcategoryIcons: Record<string, string> = {
    Effects: "✨",
    Generators: "🎨",
    Transitions: "🔀",
    Compositing: "📐",
    Utilities: "🔧",
    Composite: "🖼️",
  };
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="fixed inset-0 z-50" onclick={handleBackdropClick}>
  <div
    class="absolute w-96 bg-neutral-900 border border-neutral-700 rounded-lg shadow-2xl overflow-hidden"
    style="left: {position.x}px; top: {position.y}px; max-height: 500px;"
  >
    <!-- Search Input -->
    <div class="p-2 border-b border-neutral-700">
      <Input
        bind:ref={inputRef}
        type="text"
        placeholder="Search nodes..."
        bind:value={searchQuery}
        onkeydown={handleKeydown}
        class="h-8 bg-neutral-800 border-neutral-600 text-sm"
      />
    </div>

    <!-- Results -->
    <div class="overflow-y-auto max-h-[420px]">
      {#if filteredNodes.length === 0}
        <div class="p-4 text-center text-neutral-500 text-sm">
          No nodes found
        </div>
      {:else}
        {#each [...groupedNodes().entries()] as [category, group]}
          {@const isExpanded =
            expandedCategories.has(category) || searchQuery.trim().length > 0}
          {@const totalCount =
            group.nodes.length +
            [...group.subcategories.values()].reduce((a, b) => a + b.length, 0)}

          <div class="border-b border-neutral-800 last:border-b-0">
            <!-- Category Header -->
            <button
              class="w-full px-3 py-2 text-left flex items-center gap-2 hover:bg-neutral-800/50 transition-colors"
              onclick={() => toggleCategory(category)}
            >
              <span
                class="text-neutral-500 text-xs transition-transform {isExpanded
                  ? 'rotate-90'
                  : ''}">▶</span
              >
              <span class="text-base">{NODE_CATEGORIES[category].icon}</span>
              <span class="text-sm font-medium text-white"
                >{NODE_CATEGORIES[category].label}</span
              >
              <span class="text-[10px] text-neutral-500 ml-auto"
                >({totalCount})</span
              >
            </button>

            {#if isExpanded}
              <!-- Direct Nodes -->
              {#if group.nodes.length > 0}
                <div class="pb-1">
                  {#each group.nodes as node}
                    {@const globalIndex = flatList().findIndex(
                      (n) => n.type === node.type,
                    )}
                    <button
                      class={cn(
                        "w-full pl-8 pr-3 py-1.5 flex items-center gap-2 text-left transition-colors",
                        globalIndex === selectedIndex
                          ? "bg-neutral-700/50"
                          : "hover:bg-neutral-800",
                      )}
                      onclick={() => onSelect(node.type)}
                      onmouseenter={() => {
                        if (globalIndex >= 0) selectedIndex = globalIndex;
                      }}
                    >
                      <span class="text-sm">{node.icon}</span>
                      <span class="text-sm text-white truncate flex-1"
                        >{node.label}</span
                      >
                    </button>
                  {/each}
                </div>
              {/if}

              <!-- Subcategories (for ISF shaders) -->
              {#if group.subcategories.size > 0}
                {#each [...group.subcategories.entries()].sort( (a, b) => a[0].localeCompare(b[0]), ) as [subcat, nodes]}
                  {@const subcatKey = `${category}:${subcat}`}
                  {@const isSubExpanded =
                    expandedSubcategories.has(subcatKey) ||
                    searchQuery.trim().length > 0}

                  <button
                    class="w-full pl-6 pr-3 py-1.5 text-left flex items-center gap-2 hover:bg-neutral-800/30 transition-colors"
                    onclick={() => toggleSubcategory(subcatKey)}
                  >
                    <span
                      class="text-neutral-600 text-[10px] transition-transform {isSubExpanded
                        ? 'rotate-90'
                        : ''}">▶</span
                    >
                    <span class="text-xs"
                      >{subcategoryIcons[subcat] ?? "📁"}</span
                    >
                    <span class="text-xs font-medium text-neutral-400"
                      >{subcat}</span
                    >
                    <span class="text-[10px] text-neutral-600 ml-auto"
                      >({nodes.length})</span
                    >
                  </button>

                  {#if isSubExpanded}
                    <div class="pb-1">
                      {#each nodes.sort( (a, b) => a.label.localeCompare(b.label), ) as node}
                        {@const globalIndex = flatList().findIndex(
                          (n) => n.type === node.type,
                        )}
                        <button
                          class={cn(
                            "w-full pl-12 pr-3 py-1 flex items-center gap-2 text-left transition-colors",
                            globalIndex === selectedIndex
                              ? "bg-neutral-700/50"
                              : "hover:bg-neutral-800",
                          )}
                          onclick={() => onSelect(node.type)}
                          onmouseenter={() => {
                            if (globalIndex >= 0) selectedIndex = globalIndex;
                          }}
                        >
                          <span class="text-xs text-white truncate"
                            >{node.label}</span
                          >
                        </button>
                      {/each}
                    </div>
                  {/if}
                {/each}
              {/if}
            {/if}
          </div>
        {/each}
      {/if}
    </div>

    <!-- Footer -->
    <div
      class="px-3 py-2 border-t border-neutral-700 text-[10px] text-neutral-500 flex items-center justify-between"
    >
      <span>
        <kbd class="px-1 py-0.5 bg-neutral-800 rounded text-[9px]">↑↓</kbd> Navigate
      </span>
      <span>
        <kbd class="px-1 py-0.5 bg-neutral-800 rounded text-[9px]">Enter</kbd> Select
      </span>
      <span>
        <kbd class="px-1 py-0.5 bg-neutral-800 rounded text-[9px]">Esc</kbd> Close
      </span>
    </div>
  </div>
</div>
