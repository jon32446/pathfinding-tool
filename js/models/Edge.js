/**
 * Edge Model - Represents a connection between two waypoints
 * 
 * Supports both straight lines and bezier curves
 */

import { generateId } from '../utils/helpers.js';

/**
 * @typedef {Object} ControlPoint
 * @property {number} x - X coordinate
 * @property {number} y - Y coordinate
 */

/**
 * @typedef {Object} EdgeData
 * @property {string} id - Unique edge identifier
 * @property {string} from - Source waypoint ID
 * @property {string} to - Target waypoint ID
 * @property {number} cost - Edge cost/weight (default: 1)
 * @property {'straight'|'bezier'} type - Edge type
 * @property {ControlPoint[]} [controlPoints] - Control points for bezier curves
 * @property {boolean} [bidirectional] - Whether edge can be traversed both ways (default: true)
 * @property {boolean} [costOverride] - If true, cost is manually set; if false, auto-calculated from terrain
 */

/**
 * Create a new straight edge
 * @param {Object} options
 * @param {string} options.from - Source waypoint ID
 * @param {string} options.to - Target waypoint ID
 * @param {number} [options.cost] - Edge cost (default: 1)
 * @returns {EdgeData}
 */
export function createEdge({ from, to, cost = 1 }) {
    return {
        id: generateId('edge'),
        from,
        to,
        cost,
        type: 'straight',
        controlPoints: [],
        bidirectional: true,
        costOverride: false  // Auto-calculate from terrain by default
    };
}

/**
 * Validate edge data
 * @param {EdgeData} edge 
 * @returns {{valid: boolean, errors: string[]}}
 */
export function validateEdge(edge) {
    const errors = [];
    
    if (!edge.id) {
        errors.push('Edge must have an ID');
    }
    
    if (!edge.from) {
        errors.push('Edge must have a source waypoint');
    }
    
    if (!edge.to) {
        errors.push('Edge must have a target waypoint');
    }
    
    if (edge.from === edge.to) {
        errors.push('Edge cannot connect a waypoint to itself');
    }
    
    if (typeof edge.cost !== 'number' || edge.cost < 0) {
        errors.push('Edge cost must be a non-negative number');
    }
    
    if (edge.type === 'bezier' && (!Array.isArray(edge.controlPoints) || edge.controlPoints.length === 0)) {
        errors.push('Bezier edge must have control points');
    }
    
    return {
        valid: errors.length === 0,
        errors
    };
}

/**
 * Update edge data
 * @param {EdgeData} edge 
 * @param {Partial<EdgeData>} changes 
 * @returns {EdgeData}
 */
export function updateEdge(edge, changes) {
    return {
        ...edge,
        ...changes
    };
}

/**
 * Convert a straight edge to a bezier curve
 * @param {EdgeData} edge 
 * @param {import('./Waypoint.js').WaypointData} fromWaypoint 
 * @param {import('./Waypoint.js').WaypointData} toWaypoint 
 * @returns {EdgeData}
 */
export function convertToBezier(edge, fromWaypoint, toWaypoint) {
    // Calculate default control points at 1/3 and 2/3 along the line
    // with a perpendicular offset for a nice curve
    const dx = toWaypoint.x - fromWaypoint.x;
    const dy = toWaypoint.y - fromWaypoint.y;
    const length = Math.sqrt(dx * dx + dy * dy);
    
    // Perpendicular offset (adjust for curve intensity)
    const offset = length * 0.2;
    const perpX = -dy / length * offset;
    const perpY = dx / length * offset;
    
    // Control point 1: 1/3 along with perpendicular offset
    const cp1 = {
        x: fromWaypoint.x + dx / 3 + perpX,
        y: fromWaypoint.y + dy / 3 + perpY
    };
    
    // Control point 2: 2/3 along with perpendicular offset
    const cp2 = {
        x: fromWaypoint.x + dx * 2 / 3 + perpX,
        y: fromWaypoint.y + dy * 2 / 3 + perpY
    };
    
    return {
        ...edge,
        type: 'bezier',
        controlPoints: [cp1, cp2]
    };
}

/**
 * Convert a bezier edge back to a straight line
 * @param {EdgeData} edge 
 * @returns {EdgeData}
 */
export function convertToStraight(edge) {
    return {
        ...edge,
        type: 'straight',
        controlPoints: []
    };
}

/**
 * Check if an edge already exists between two waypoints
 * @param {EdgeData[]} edges 
 * @param {string} from 
 * @param {string} to 
 * @returns {boolean}
 */
export function edgeExists(edges, from, to) {
    return edges.some(edge => 
        (edge.from === from && edge.to === to) ||
        (edge.bidirectional && edge.from === to && edge.to === from)
    );
}

/**
 * Get all edges connected to a waypoint
 * @param {EdgeData[]} edges 
 * @param {string} waypointId 
 * @returns {EdgeData[]}
 */
export function getConnectedEdges(edges, waypointId) {
    return edges.filter(edge => 
        edge.from === waypointId || edge.to === waypointId
    );
}

/**
 * Get neighboring waypoint IDs for a given waypoint
 * @param {EdgeData[]} edges 
 * @param {string} waypointId 
 * @returns {string[]}
 */
export function getNeighbors(edges, waypointId) {
    const neighbors = new Set();
    
    edges.forEach(edge => {
        if (edge.from === waypointId) {
            neighbors.add(edge.to);
        }
        if (edge.bidirectional && edge.to === waypointId) {
            neighbors.add(edge.from);
        }
    });
    
    return Array.from(neighbors);
}
