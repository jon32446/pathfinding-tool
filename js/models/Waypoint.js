/**
 * Waypoint Model - Represents a point on the map
 */

import { generateId } from '../utils/helpers.js';

/**
 * @typedef {Object} WaypointData
 * @property {string} id - Unique waypoint identifier
 * @property {number} x - X coordinate (relative to map image)
 * @property {number} y - Y coordinate (relative to map image)
 * @property {string} [name] - Optional display name
 * @property {boolean} [isPortal] - Whether this waypoint is a portal to another map
 * @property {string|null} [portalTargetMapId] - Target map ID if this is a portal
 * @property {string|null} [portalTargetWaypointId] - Target waypoint ID in the target map
 */

/**
 * Create a new waypoint
 * @param {Object} options
 * @param {number} options.x - X coordinate
 * @param {number} options.y - Y coordinate
 * @param {string} [options.name] - Optional name
 * @returns {WaypointData}
 */
export function createWaypoint({ x, y, name = '' }) {
    return {
        id: generateId('wp'),
        x,
        y,
        name,
        isPortal: false,
        portalTargetMapId: null,
        portalTargetWaypointId: null
    };
}

/**
 * Validate waypoint data
 * @param {WaypointData} waypoint 
 * @returns {{valid: boolean, errors: string[]}}
 */
export function validateWaypoint(waypoint) {
    const errors = [];
    
    if (!waypoint.id) {
        errors.push('Waypoint must have an ID');
    }
    
    if (typeof waypoint.x !== 'number' || isNaN(waypoint.x)) {
        errors.push('Waypoint must have a valid x coordinate');
    }
    
    if (typeof waypoint.y !== 'number' || isNaN(waypoint.y)) {
        errors.push('Waypoint must have a valid y coordinate');
    }
    
    if (waypoint.isPortal && !waypoint.portalTargetMapId) {
        errors.push('Portal waypoint must have a target map');
    }
    
    return {
        valid: errors.length === 0,
        errors
    };
}

/**
 * Update waypoint data
 * @param {WaypointData} waypoint 
 * @param {Partial<WaypointData>} changes 
 * @returns {WaypointData}
 */
export function updateWaypoint(waypoint, changes) {
    return {
        ...waypoint,
        ...changes
    };
}

/**
 * Make a waypoint a portal
 * @param {WaypointData} waypoint 
 * @param {string} targetMapId 
 * @param {string|null} [targetWaypointId] 
 * @returns {WaypointData}
 */
export function makePortal(waypoint, targetMapId, targetWaypointId = null) {
    return {
        ...waypoint,
        isPortal: true,
        portalTargetMapId: targetMapId,
        portalTargetWaypointId: targetWaypointId
    };
}

/**
 * Remove portal status from a waypoint
 * @param {WaypointData} waypoint 
 * @returns {WaypointData}
 */
export function removePortal(waypoint) {
    return {
        ...waypoint,
        isPortal: false,
        portalTargetMapId: null,
        portalTargetWaypointId: null
    };
}

/**
 * Calculate distance between two waypoints
 * @param {WaypointData} wp1 
 * @param {WaypointData} wp2 
 * @returns {number}
 */
export function distanceBetween(wp1, wp2) {
    const dx = wp2.x - wp1.x;
    const dy = wp2.y - wp1.y;
    return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Check if a point is near a waypoint
 * @param {WaypointData} waypoint 
 * @param {number} x 
 * @param {number} y 
 * @param {number} threshold - Distance threshold
 * @returns {boolean}
 */
export function isNearWaypoint(waypoint, x, y, threshold = 10) {
    const dx = waypoint.x - x;
    const dy = waypoint.y - y;
    return Math.sqrt(dx * dx + dy * dy) <= threshold;
}
