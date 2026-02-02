/**
 * Layout utilities for automatic node arrangement using Dagre
 */
import dagre from "dagre";
import type { VisoicNode, VisoicEdge } from "./types";

export type LayoutDirection = "TB" | "BT" | "LR" | "RL";

export interface LayoutOptions {
  direction: LayoutDirection;
  nodeWidth?: number;
  nodeHeight?: number;
  nodeSeparation?: number;
  rankSeparation?: number;
  edgeSeparation?: number;
}

const DEFAULT_NODE_WIDTH = 300;
const DEFAULT_NODE_HEIGHT = 250;
const DEFAULT_NODE_SEPARATION = 60;
const DEFAULT_RANK_SEPARATION = 100;
const DEFAULT_EDGE_SEPARATION = 25;

/**
 * Get the measured dimensions of a node, falling back to defaults
 */
function getNodeDimensions(
  node: VisoicNode,
  defaultWidth: number,
  defaultHeight: number
): { width: number; height: number } {
  const nodeAny = node as any;

  // Check for measured dimensions from SvelteFlow (primary source)
  if (nodeAny.measured?.width && nodeAny.measured?.height) {
    // Add padding for spacing
    return {
      width: nodeAny.measured.width + 20,
      height: nodeAny.measured.height + 20
    };
  }

  // Check for explicit width/height on the node
  if (nodeAny.width && nodeAny.height) {
    return {
      width: nodeAny.width + 20,
      height: nodeAny.height + 20
    };
  }

  // Check for computed style dimensions
  if (nodeAny.computedWidth && nodeAny.computedHeight) {
    return {
      width: nodeAny.computedWidth + 20,
      height: nodeAny.computedHeight + 20,
    };
  }

  // Use category-based defaults for better estimation
  const category = node.data?.category;
  switch (category) {
    case "shader":
      return { width: 340, height: 450 }; // Shader nodes have preview - much taller
    case "output":
      return { width: 340, height: 400 }; // Output nodes have preview
    case "audio":
      return { width: 300, height: 550 }; // Audio nodes can be very tall with waveform
    case "value":
      return { width: 280, height: 200 }; // Value nodes with sliders
    case "math":
      return { width: 280, height: 180 }; // Math nodes
    case "logic":
      return { width: 280, height: 180 }; // Logic nodes
    case "utility":
      return { width: 280, height: 200 }; // Utility nodes
    default:
      return { width: defaultWidth, height: defaultHeight };
  }
}

/**
 * Apply automatic layout to nodes and edges using Dagre
 */
export function getLayoutedElements(
  nodes: VisoicNode[],
  edges: VisoicEdge[],
  options: LayoutOptions
): { nodes: VisoicNode[]; edges: VisoicEdge[] } {
  console.log("[Dagre] getLayoutedElements called with", nodes.length, "nodes");

  if (nodes.length === 0) {
    return { nodes, edges };
  }

  const {
    direction,
    nodeWidth = DEFAULT_NODE_WIDTH,
    nodeHeight = DEFAULT_NODE_HEIGHT,
    nodeSeparation = DEFAULT_NODE_SEPARATION,
    rankSeparation = DEFAULT_RANK_SEPARATION,
    edgeSeparation = DEFAULT_EDGE_SEPARATION,
  } = options;

  const isHorizontal = direction === "LR" || direction === "RL";

  // Create a new dagre graph
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));

  // Configure the graph with optimized settings for cleaner edge routing
  dagreGraph.setGraph({
    rankdir: direction,
    nodesep: nodeSeparation,
    ranksep: rankSeparation,
    edgesep: edgeSeparation,
    marginx: 50,
    marginy: 50,
    // Use tight-tree for more compact layout with less edge crossings
    ranker: "tight-tree",
    // No align = center alignment (nodes centered vertically within their rank)
    // Improve edge routing
    acyclicer: "greedy",
  });

  // Add nodes to dagre with their actual/estimated dimensions
  const nodeDimensions = new Map<string, { width: number; height: number }>();
  for (const node of nodes) {
    const dimensions = getNodeDimensions(node, nodeWidth, nodeHeight);
    nodeDimensions.set(node.id, dimensions);
    dagreGraph.setNode(node.id, dimensions);
  }

  // Add edges to dagre with weights to prioritize important connections
  for (const edge of edges) {
    // Give higher weight to edges to reduce their length/crossing
    dagreGraph.setEdge(edge.source, edge.target, { weight: 1, minlen: 1 });
  }

  // Run the layout algorithm
  dagre.layout(dagreGraph);

  console.log("[Dagre] Layout calculated, mapping positions...");

  // Apply the layout positions to nodes
  const layoutedNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    const dimensions = nodeDimensions.get(node.id)!;

    console.log("[Dagre] Node", node.id, "position from dagre:", nodeWithPosition);

    // Dagre positions nodes at their center, but SvelteFlow uses top-left anchor
    // So we need to shift by half the width/height
    const newPosition = {
      x: nodeWithPosition.x - dimensions.width / 2,
      y: nodeWithPosition.y - dimensions.height / 2,
    };

    return {
      ...node,
      position: newPosition,
      // Update target/source positions based on layout direction
      targetPosition: isHorizontal ? "left" : "top",
      sourcePosition: isHorizontal ? "right" : "bottom",
    } as VisoicNode;
  });

  return { nodes: layoutedNodes, edges };
}

/**
 * Layout presets for common use cases
 */
export const layoutPresets = {
  /** Top to bottom (standard flow) */
  vertical: {
    direction: "TB" as LayoutDirection,
    rankSeparation: 120,
    nodeSeparation: 50,
  },
  /** Left to right (horizontal flow) - best for node graphs */
  horizontal: {
    direction: "LR" as LayoutDirection,
    rankSeparation: 150,
    nodeSeparation: 40,
  },
  /** Bottom to top (reverse flow) */
  reverseVertical: {
    direction: "BT" as LayoutDirection,
    rankSeparation: 120,
    nodeSeparation: 50,
  },
  /** Right to left (reverse horizontal) */
  reverseHorizontal: {
    direction: "RL" as LayoutDirection,
    rankSeparation: 150,
    nodeSeparation: 40,
  },
  /** Compact layout with less spacing */
  compact: {
    direction: "LR" as LayoutDirection,
    rankSeparation: 80,
    nodeSeparation: 30,
  },
  /** Spread out layout for better visibility */
  spread: {
    direction: "LR" as LayoutDirection,
    rankSeparation: 200,
    nodeSeparation: 60,
  },
};
