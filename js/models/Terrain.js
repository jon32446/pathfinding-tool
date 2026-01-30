/**
 * Terrain Model - Represents terrain types and the terrain grid layer
 * 
 * Terrain is stored as a low-resolution grid overlaying the map image.
 * Each cell contains a terrain type ID. Terrain types have associated costs.
 */

import { generateId } from '../utils/helpers.js';

/**
 * Default terrain types with costs
 * Users can customize these per-map
 */
export const DEFAULT_TERRAIN_TYPES = [
    { id: 'clear', name: 'Clear/Road', cost: 1, color: '#22c55e' },      // Green - easy
    { id: 'grassland', name: 'Grassland', cost: 1.5, color: '#86efac' }, // Light green
    { id: 'forest', name: 'Forest', cost: 2.5, color: '#166534' },       // Dark green
    { id: 'hills', name: 'Hills', cost: 3, color: '#a16207' },           // Brown
    { id: 'mountain', name: 'Mountain', cost: 5, color: '#78716c' },     // Gray
    { id: 'swamp', name: 'Swamp/Bog', cost: 4, color: '#365314' },       // Murky green
    { id: 'water', name: 'Water', cost: 8, color: '#0ea5e9' },           // Blue
    { id: 'impassable', name: 'Impassable', cost: 999, color: '#1c1917' } // Near black
];

/**
 * Default grid resolution
 * Higher = more detail but larger storage
 */
export const DEFAULT_GRID_SIZE = 100;

/**
 * @typedef {Object} TerrainType
 * @property {string} id - Unique terrain type ID
 * @property {string} name - Display name
 * @property {number} cost - Movement cost multiplier
 * @property {string} color - Hex color for display
 */

/**
 * @typedef {Object} TerrainLayer
 * @property {number} gridWidth - Number of cells horizontally
 * @property {number} gridHeight - Number of cells vertically
 * @property {string[]} grid - Flat array of terrain type IDs (row-major order)
 * @property {TerrainType[]} types - Terrain types defined for this map
 */

/**
 * Create a new terrain layer for a map
 * @param {number} imageWidth - Map image width
 * @param {number} imageHeight - Map image height
 * @param {number} [gridSize=DEFAULT_GRID_SIZE] - Grid resolution (cells on longest side)
 * @returns {TerrainLayer}
 */
export function createTerrainLayer(imageWidth, imageHeight, gridSize = DEFAULT_GRID_SIZE) {
    // Calculate grid dimensions maintaining aspect ratio
    const aspectRatio = imageWidth / imageHeight;
    let gridWidth, gridHeight;
    
    if (aspectRatio >= 1) {
        gridWidth = gridSize;
        gridHeight = Math.max(1, Math.round(gridSize / aspectRatio));
    } else {
        gridHeight = gridSize;
        gridWidth = Math.max(1, Math.round(gridSize * aspectRatio));
    }
    
    // Initialize grid with 'clear' terrain (or null for unpainted)
    const grid = new Array(gridWidth * gridHeight).fill(null);
    
    return {
        gridWidth,
        gridHeight,
        grid,
        types: [...DEFAULT_TERRAIN_TYPES]
    };
}

/**
 * Get terrain type at a grid cell
 * @param {TerrainLayer} terrain 
 * @param {number} cellX 
 * @param {number} cellY 
 * @returns {string|null} Terrain type ID or null if unpainted
 */
export function getTerrainAt(terrain, cellX, cellY) {
    if (cellX < 0 || cellX >= terrain.gridWidth || cellY < 0 || cellY >= terrain.gridHeight) {
        return null;
    }
    const index = cellY * terrain.gridWidth + cellX;
    return terrain.grid[index];
}

/**
 * Set terrain type at a grid cell
 * @param {TerrainLayer} terrain 
 * @param {number} cellX 
 * @param {number} cellY 
 * @param {string|null} typeId - Terrain type ID or null to clear
 * @returns {TerrainLayer} New terrain layer (immutable update)
 */
export function setTerrainAt(terrain, cellX, cellY, typeId) {
    if (cellX < 0 || cellX >= terrain.gridWidth || cellY < 0 || cellY >= terrain.gridHeight) {
        return terrain;
    }
    const index = cellY * terrain.gridWidth + cellX;
    const newGrid = [...terrain.grid];
    newGrid[index] = typeId;
    return { ...terrain, grid: newGrid };
}

/**
 * Paint terrain in a circular brush area
 * @param {TerrainLayer} terrain 
 * @param {number} centerX - Center cell X
 * @param {number} centerY - Center cell Y
 * @param {number} radius - Brush radius in cells
 * @param {string|null} typeId - Terrain type ID
 * @returns {TerrainLayer}
 */
export function paintTerrain(terrain, centerX, centerY, radius, typeId) {
    const newGrid = [...terrain.grid];
    const radiusSq = radius * radius;
    
    for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
            if (dx * dx + dy * dy <= radiusSq) {
                const cellX = Math.round(centerX + dx);
                const cellY = Math.round(centerY + dy);
                
                if (cellX >= 0 && cellX < terrain.gridWidth && 
                    cellY >= 0 && cellY < terrain.gridHeight) {
                    const index = cellY * terrain.gridWidth + cellX;
                    newGrid[index] = typeId;
                }
            }
        }
    }
    
    return { ...terrain, grid: newGrid };
}

/**
 * Convert image coordinates to grid cell coordinates
 * @param {number} imageX 
 * @param {number} imageY 
 * @param {number} imageWidth 
 * @param {number} imageHeight 
 * @param {TerrainLayer} terrain 
 * @returns {{cellX: number, cellY: number}}
 */
export function imageToGrid(imageX, imageY, imageWidth, imageHeight, terrain) {
    const cellX = Math.floor((imageX / imageWidth) * terrain.gridWidth);
    const cellY = Math.floor((imageY / imageHeight) * terrain.gridHeight);
    return { 
        cellX: Math.max(0, Math.min(terrain.gridWidth - 1, cellX)),
        cellY: Math.max(0, Math.min(terrain.gridHeight - 1, cellY))
    };
}

/**
 * Convert grid cell to image coordinates (center of cell)
 * @param {number} cellX 
 * @param {number} cellY 
 * @param {number} imageWidth 
 * @param {number} imageHeight 
 * @param {TerrainLayer} terrain 
 * @returns {{imageX: number, imageY: number}}
 */
export function gridToImage(cellX, cellY, imageWidth, imageHeight, terrain) {
    const imageX = ((cellX + 0.5) / terrain.gridWidth) * imageWidth;
    const imageY = ((cellY + 0.5) / terrain.gridHeight) * imageHeight;
    return { imageX, imageY };
}

/**
 * Get terrain type definition by ID
 * @param {TerrainLayer} terrain 
 * @param {string} typeId 
 * @returns {TerrainType|null}
 */
export function getTerrainType(terrain, typeId) {
    return terrain.types.find(t => t.id === typeId) || null;
}

/**
 * Get the cost of terrain at a specific image coordinate
 * @param {TerrainLayer} terrain 
 * @param {number} imageX 
 * @param {number} imageY 
 * @param {number} imageWidth 
 * @param {number} imageHeight 
 * @returns {number} Cost value (1 if unpainted)
 */
export function getTerrainCostAt(terrain, imageX, imageY, imageWidth, imageHeight) {
    const { cellX, cellY } = imageToGrid(imageX, imageY, imageWidth, imageHeight, terrain);
    const typeId = getTerrainAt(terrain, cellX, cellY);
    
    if (!typeId) return 1; // Default cost for unpainted areas
    
    const type = getTerrainType(terrain, typeId);
    return type ? type.cost : 1;
}

/**
 * Calculate total terrain cost along a path (samples N points)
 * @param {TerrainLayer} terrain 
 * @param {{x: number, y: number}[]} points - Points along the path
 * @param {number} imageWidth 
 * @param {number} imageHeight 
 * @returns {number} Total cost
 */
export function calculatePathTerrainCost(terrain, points, imageWidth, imageHeight) {
    if (points.length < 2) return 0;
    
    let totalCost = 0;
    
    for (let i = 0; i < points.length - 1; i++) {
        const p1 = points[i];
        const p2 = points[i + 1];
        
        // Distance between points (for weighting)
        const dist = Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2);
        
        // Sample midpoint terrain
        const midX = (p1.x + p2.x) / 2;
        const midY = (p1.y + p2.y) / 2;
        const cost = getTerrainCostAt(terrain, midX, midY, imageWidth, imageHeight);
        
        totalCost += dist * cost;
    }
    
    // Normalize by dividing by a base unit (e.g., 100 pixels = 1 cost unit)
    return totalCost / 100;
}

/**
 * Sample points along a straight line
 * @param {number} x1 
 * @param {number} y1 
 * @param {number} x2 
 * @param {number} y2 
 * @param {number} numSamples 
 * @returns {{x: number, y: number}[]}
 */
export function sampleLine(x1, y1, x2, y2, numSamples = 20) {
    const points = [];
    for (let i = 0; i <= numSamples; i++) {
        const t = i / numSamples;
        points.push({
            x: x1 + (x2 - x1) * t,
            y: y1 + (y2 - y1) * t
        });
    }
    return points;
}

/**
 * Sample points along a cubic bezier curve
 * @param {{x: number, y: number}} p0 
 * @param {{x: number, y: number}} p1 
 * @param {{x: number, y: number}} p2 
 * @param {{x: number, y: number}} p3 
 * @param {number} numSamples 
 * @returns {{x: number, y: number}[]}
 */
export function sampleBezier(p0, p1, p2, p3, numSamples = 20) {
    const points = [];
    for (let i = 0; i <= numSamples; i++) {
        const t = i / numSamples;
        const mt = 1 - t;
        const mt2 = mt * mt;
        const mt3 = mt2 * mt;
        const t2 = t * t;
        const t3 = t2 * t;
        
        points.push({
            x: mt3 * p0.x + 3 * mt2 * t * p1.x + 3 * mt * t2 * p2.x + t3 * p3.x,
            y: mt3 * p0.y + 3 * mt2 * t * p1.y + 3 * mt * t2 * p2.y + t3 * p3.y
        });
    }
    return points;
}

/**
 * Calculate the cost of an edge based on terrain
 * @param {Object} edge - Edge data
 * @param {Object} fromWp - Source waypoint
 * @param {Object} toWp - Target waypoint
 * @param {TerrainLayer|null} terrain 
 * @param {number} imageWidth 
 * @param {number} imageHeight 
 * @returns {number} Calculated cost
 */
export function calculateEdgeTerrainCost(edge, fromWp, toWp, terrain, imageWidth, imageHeight) {
    // If no terrain, return a distance-based cost
    if (!terrain) {
        const dist = Math.sqrt((toWp.x - fromWp.x) ** 2 + (toWp.y - fromWp.y) ** 2);
        return Math.round(dist / 100 * 10) / 10; // Round to 1 decimal
    }
    
    // Sample points along the edge
    let points;
    if (edge.type === 'bezier' && edge.controlPoints && edge.controlPoints.length >= 2) {
        points = sampleBezier(
            { x: fromWp.x, y: fromWp.y },
            edge.controlPoints[0],
            edge.controlPoints[1],
            { x: toWp.x, y: toWp.y },
            30 // More samples for curves
        );
    } else {
        points = sampleLine(fromWp.x, fromWp.y, toWp.x, toWp.y, 20);
    }
    
    // Calculate terrain cost
    const cost = calculatePathTerrainCost(terrain, points, imageWidth, imageHeight);
    return Math.round(cost * 10) / 10; // Round to 1 decimal
}
