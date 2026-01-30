/**
 * Pathfinder - Dijkstra's algorithm and Yen's K-shortest paths
 * 
 * Finds optimal routes between waypoints with support for
 * alternative routes.
 */

import { getBezierLength } from './BezierUtils.js';

/**
 * @typedef {Object} GraphNode
 * @property {string} id - Node ID
 * @property {Map<string, {cost: number, edgeId: string}>} neighbors - Adjacent nodes
 */

/**
 * @typedef {Object} PathResult
 * @property {string[]} path - Array of waypoint IDs in order
 * @property {number} cost - Total path cost
 * @property {string[]} edges - Array of edge IDs used
 */

export class Pathfinder {
    constructor() {
        /** @type {Map<string, GraphNode>} */
        this.graph = new Map();
    }
    
    /**
     * Build a graph from waypoints and edges
     * @param {import('../models/Waypoint.js').WaypointData[]} waypoints 
     * @param {import('../models/Edge.js').EdgeData[]} edges 
     * @returns {Map<string, GraphNode>}
     */
    buildGraph(waypoints, edges) {
        this.graph = new Map();
        
        // Create nodes for all waypoints
        waypoints.forEach(wp => {
            this.graph.set(wp.id, {
                id: wp.id,
                neighbors: new Map()
            });
        });
        
        // Create waypoint lookup for bezier length calculation
        const waypointMap = new Map(waypoints.map(wp => [wp.id, wp]));
        
        // Add edges
        edges.forEach(edge => {
            const fromNode = this.graph.get(edge.from);
            const toNode = this.graph.get(edge.to);
            
            if (!fromNode || !toNode) return;
            
            // Calculate edge cost (base cost * length factor for bezier)
            let edgeCost = edge.cost;
            
            if (edge.type === 'bezier' && edge.controlPoints && edge.controlPoints.length >= 2) {
                const fromWp = waypointMap.get(edge.from);
                const toWp = waypointMap.get(edge.to);
                if (fromWp && toWp) {
                    const bezierLength = getBezierLength(
                        { x: fromWp.x, y: fromWp.y },
                        edge.controlPoints[0],
                        edge.controlPoints[1],
                        { x: toWp.x, y: toWp.y }
                    );
                    const straightLength = Math.sqrt(
                        Math.pow(toWp.x - fromWp.x, 2) + Math.pow(toWp.y - fromWp.y, 2)
                    );
                    // Adjust cost based on curve length vs straight line
                    const lengthRatio = bezierLength / (straightLength || 1);
                    edgeCost *= lengthRatio;
                }
            }
            
            // Add forward edge
            fromNode.neighbors.set(edge.to, { cost: edgeCost, edgeId: edge.id });
            
            // Add reverse edge if bidirectional
            if (edge.bidirectional !== false) {
                toNode.neighbors.set(edge.from, { cost: edgeCost, edgeId: edge.id });
            }
        });
        
        return this.graph;
    }
    
    /**
     * Find shortest path using Dijkstra's algorithm
     * @param {Map<string, GraphNode>} graph 
     * @param {string} startId 
     * @param {string} endId 
     * @param {Set<string>} [excludedEdges] - Edges to exclude
     * @param {Set<string>} [excludedNodes] - Nodes to exclude (except start/end)
     * @returns {PathResult|null}
     */
    dijkstra(graph, startId, endId, excludedEdges = new Set(), excludedNodes = new Set()) {
        // Priority queue using array (simple implementation)
        const queue = [{ id: startId, cost: 0 }];
        const costs = new Map([[startId, 0]]);
        const previous = new Map();
        const previousEdge = new Map();
        const visited = new Set();
        
        while (queue.length > 0) {
            // Get node with lowest cost
            queue.sort((a, b) => a.cost - b.cost);
            const current = queue.shift();
            
            if (visited.has(current.id)) continue;
            visited.add(current.id);
            
            // Found destination
            if (current.id === endId) {
                return this.reconstructPath(previous, previousEdge, startId, endId, costs.get(endId));
            }
            
            const node = graph.get(current.id);
            if (!node) continue;
            
            // Explore neighbors
            node.neighbors.forEach((neighbor, neighborId) => {
                // Skip excluded edges
                if (excludedEdges.has(neighbor.edgeId)) return;
                
                // Skip excluded nodes (but allow start and end)
                if (neighborId !== startId && neighborId !== endId && excludedNodes.has(neighborId)) return;
                
                if (visited.has(neighborId)) return;
                
                const newCost = current.cost + neighbor.cost;
                const existingCost = costs.get(neighborId);
                
                if (existingCost === undefined || newCost < existingCost) {
                    costs.set(neighborId, newCost);
                    previous.set(neighborId, current.id);
                    previousEdge.set(neighborId, neighbor.edgeId);
                    queue.push({ id: neighborId, cost: newCost });
                }
            });
        }
        
        // No path found
        return null;
    }
    
    /**
     * Reconstruct path from Dijkstra result
     * @param {Map<string, string>} previous 
     * @param {Map<string, string>} previousEdge 
     * @param {string} startId 
     * @param {string} endId 
     * @param {number} totalCost 
     * @returns {PathResult}
     */
    reconstructPath(previous, previousEdge, startId, endId, totalCost) {
        const path = [];
        const edges = [];
        let current = endId;
        
        while (current !== undefined) {
            path.unshift(current);
            const edge = previousEdge.get(current);
            if (edge) edges.unshift(edge);
            current = previous.get(current);
        }
        
        return { path, cost: totalCost, edges };
    }
    
    /**
     * Find K shortest paths using Yen's algorithm
     * @param {Map<string, GraphNode>} graph 
     * @param {string} startId 
     * @param {string} endId 
     * @param {number} k - Number of paths to find
     * @returns {{paths: PathResult[]}}
     */
    findKShortestPaths(graph, startId, endId, k = 2) {
        const paths = [];
        const potentialPaths = [];
        
        // Find first shortest path
        const firstPath = this.dijkstra(graph, startId, endId);
        if (!firstPath) {
            return { paths: [] };
        }
        paths.push(firstPath);
        
        // Find k-1 more paths
        for (let i = 1; i < k; i++) {
            const lastPath = paths[i - 1];
            
            // For each node in the last path (except the last node)
            for (let j = 0; j < lastPath.path.length - 1; j++) {
                const spurNode = lastPath.path[j];
                const rootPath = lastPath.path.slice(0, j + 1);
                
                // Find edges to exclude (edges used by previous paths at this point)
                const excludedEdges = new Set();
                paths.forEach(path => {
                    if (this.pathStartsWith(path.path, rootPath)) {
                        // Get the edge from spurNode to next node in this path
                        const nextIndex = rootPath.length;
                        if (nextIndex < path.path.length) {
                            const nextNode = path.path[nextIndex];
                            const node = graph.get(spurNode);
                            if (node) {
                                const edge = node.neighbors.get(nextNode);
                                if (edge) excludedEdges.add(edge.edgeId);
                            }
                        }
                    }
                });
                
                // Exclude nodes in root path (except spurNode)
                const excludedNodes = new Set(rootPath.slice(0, -1));
                
                // Find spur path
                const spurPath = this.dijkstra(graph, spurNode, endId, excludedEdges, excludedNodes);
                
                if (spurPath) {
                    // Combine root path with spur path
                    const totalPath = {
                        path: [...rootPath.slice(0, -1), ...spurPath.path],
                        cost: this.calculatePathCost(graph, rootPath.slice(0, -1)) + spurPath.cost,
                        edges: [...this.getPathEdges(graph, rootPath), ...spurPath.edges]
                    };
                    
                    // Check if this path is already found
                    const pathKey = totalPath.path.join(',');
                    const isDuplicate = potentialPaths.some(p => p.path.join(',') === pathKey) ||
                                       paths.some(p => p.path.join(',') === pathKey);
                    
                    if (!isDuplicate) {
                        potentialPaths.push(totalPath);
                    }
                }
            }
            
            if (potentialPaths.length === 0) break;
            
            // Sort by cost and add best to paths
            potentialPaths.sort((a, b) => a.cost - b.cost);
            paths.push(potentialPaths.shift());
        }
        
        return { paths };
    }
    
    /**
     * Check if a path starts with a given prefix
     * @param {string[]} path 
     * @param {string[]} prefix 
     * @returns {boolean}
     */
    pathStartsWith(path, prefix) {
        if (prefix.length > path.length) return false;
        for (let i = 0; i < prefix.length; i++) {
            if (path[i] !== prefix[i]) return false;
        }
        return true;
    }
    
    /**
     * Calculate cost of a path
     * @param {Map<string, GraphNode>} graph 
     * @param {string[]} path 
     * @returns {number}
     */
    calculatePathCost(graph, path) {
        let cost = 0;
        for (let i = 0; i < path.length - 1; i++) {
            const node = graph.get(path[i]);
            if (node) {
                const edge = node.neighbors.get(path[i + 1]);
                if (edge) cost += edge.cost;
            }
        }
        return cost;
    }
    
    /**
     * Get edge IDs for a path
     * @param {Map<string, GraphNode>} graph 
     * @param {string[]} path 
     * @returns {string[]}
     */
    getPathEdges(graph, path) {
        const edges = [];
        for (let i = 0; i < path.length - 1; i++) {
            const node = graph.get(path[i]);
            if (node) {
                const edge = node.neighbors.get(path[i + 1]);
                if (edge) edges.push(edge.edgeId);
            }
        }
        return edges;
    }
}
