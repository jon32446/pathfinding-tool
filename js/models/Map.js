/**
 * Map Model - Represents a map with waypoints and edges
 */

import { generateId } from '../utils/helpers.js';

/**
 * @typedef {Object} MapData
 * @property {string} id - Unique map identifier
 * @property {string} name - Display name
 * @property {string} imageData - Base64 image data or data URL
 * @property {number} imageWidth - Original image width
 * @property {number} imageHeight - Original image height
 * @property {import('./Waypoint.js').WaypointData[]} waypoints - Array of waypoints
 * @property {import('./Edge.js').EdgeData[]} edges - Array of edges
 * @property {import('./Terrain.js').TerrainLayer|null} terrain - Terrain layer (null if not painted)
 * @property {string|null} parentMapId - Parent map ID (for nested maps)
 * @property {number} createdAt - Creation timestamp
 * @property {number} updatedAt - Last update timestamp
 */

/**
 * Create a new map
 * @param {Object} options
 * @param {string} options.name - Map name
 * @param {string} options.imageData - Base64 image data
 * @param {number} options.imageWidth - Image width
 * @param {number} options.imageHeight - Image height
 * @param {string|null} [options.parentMapId] - Parent map ID
 * @returns {MapData}
 */
export function createMap({ name, imageData, imageWidth, imageHeight, parentMapId = null }) {
    const now = Date.now();
    return {
        id: generateId('map'),
        name: name || 'Untitled Map',
        imageData,
        imageWidth,
        imageHeight,
        waypoints: [],
        edges: [],
        terrain: null,  // Created lazily when user first paints
        parentMapId,
        createdAt: now,
        updatedAt: now
    };
}

/**
 * Validate map data
 * @param {MapData} map 
 * @returns {{valid: boolean, errors: string[]}}
 */
export function validateMap(map) {
    const errors = [];
    
    if (!map.id) {
        errors.push('Map must have an ID');
    }
    
    if (!map.name || typeof map.name !== 'string') {
        errors.push('Map must have a name');
    }
    
    if (!map.imageData) {
        errors.push('Map must have image data');
    }
    
    if (!Array.isArray(map.waypoints)) {
        errors.push('Map waypoints must be an array');
    }
    
    if (!Array.isArray(map.edges)) {
        errors.push('Map edges must be an array');
    }
    
    return {
        valid: errors.length === 0,
        errors
    };
}

/**
 * Update map data
 * @param {MapData} map 
 * @param {Partial<MapData>} changes 
 * @returns {MapData}
 */
export function updateMap(map, changes) {
    return {
        ...map,
        ...changes,
        updatedAt: Date.now()
    };
}

/**
 * Get all child map IDs for a given map
 * @param {Object.<string, MapData>} maps - All maps
 * @param {string} parentId - Parent map ID
 * @returns {string[]} Array of child map IDs
 */
export function getChildMapIds(maps, parentId) {
    return Object.values(maps)
        .filter(map => map.parentMapId === parentId)
        .map(map => map.id);
}

/**
 * Get the map hierarchy as a tree structure
 * @param {Object.<string, MapData>} maps - All maps
 * @returns {Array} Tree structure
 */
export function getMapTree(maps) {
    const mapArray = Object.values(maps);
    const tree = [];
    const mapById = {};
    
    // First pass: create nodes
    mapArray.forEach(map => {
        mapById[map.id] = {
            ...map,
            children: []
        };
    });
    
    // Second pass: build tree
    mapArray.forEach(map => {
        const node = mapById[map.id];
        if (map.parentMapId && mapById[map.parentMapId]) {
            mapById[map.parentMapId].children.push(node);
        } else {
            tree.push(node);
        }
    });
    
    // Sort by name
    const sortByName = (a, b) => a.name.localeCompare(b.name);
    tree.sort(sortByName);
    Object.values(mapById).forEach(node => {
        node.children.sort(sortByName);
    });
    
    return tree;
}

/**
 * Get the path from root to a specific map
 * @param {Object.<string, MapData>} maps - All maps
 * @param {string} mapId - Target map ID
 * @returns {MapData[]} Array of maps from root to target
 */
export function getMapPath(maps, mapId) {
    const path = [];
    let currentId = mapId;
    
    while (currentId) {
        const map = maps[currentId];
        if (!map) break;
        path.unshift(map);
        currentId = map.parentMapId;
    }
    
    return path;
}
