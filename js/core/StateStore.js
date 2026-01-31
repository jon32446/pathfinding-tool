/**
 * StateStore - Central state management with change notifications
 * 
 * Holds the application state and notifies listeners when it changes.
 * Similar to Redux but much simpler.
 */

/**
 * @typedef {Object} AppState
 * @property {string} mode - Current mode: 'edit' or 'view'
 * @property {string} currentTool - Current edit tool: 'select', 'waypoint', 'edge', 'pan'
 * @property {string|null} currentMapId - Currently active map ID
 * @property {Object.<string, import('../models/Map.js').MapData>} maps - All maps by ID
 * @property {string|null} selectedWaypoint - Selected waypoint ID
 * @property {string|null} selectedEdge - Selected edge ID
 * @property {string|null} routeStart - Start waypoint ID for routing
 * @property {string|null} routeEnd - End waypoint ID for routing
 * @property {Array|null} currentRoute - Current calculated route
 * @property {Array|null} alternativeRoute - Alternative route
 * @property {number} zoom - Current zoom level (1.0 = 100%)
 * @property {{x: number, y: number}} pan - Current pan offset
 */

/** @type {AppState} */
const DEFAULT_STATE = {
    mode: 'edit',
    currentTool: 'select',
    currentMapId: null,
    maps: {},
    selectedWaypoint: null,
    selectedEdge: null,
    routeStart: null,
    routeEnd: null,
    currentRoute: null,
    alternativeRoute: null,
    zoom: 1,
    pan: { x: 0, y: 0 }
};

const MAX_HISTORY_SIZE = 100;

export class StateStore {
    /**
     * @param {import('./EventBus.js').EventBus} eventBus 
     */
    constructor(eventBus) {
        this.eventBus = eventBus;
        /** @type {AppState} */
        this.state = { ...DEFAULT_STATE };
        
        // Undo/redo history (stores only mutable map data, not images)
        this.history = [];
        this.historyIndex = -1;
        this.isRestoringHistory = false; // Prevent history push during restore
        this.hasUnsavedChanges = false; // Track if there are changes not yet in history
    }
    
    /**
     * Get the current state
     * @returns {AppState}
     */
    getState() {
        return this.state;
    }
    
    /**
     * Push current map state to history (for undo)
     * Only stores mutable data (waypoints, edges, terrain), not images
     */
    pushHistory() {
        if (this.isRestoringHistory) return;
        
        const map = this.getCurrentMap();
        if (!map) return;
        
        // Create snapshot of mutable data only
        const snapshot = {
            mapId: map.id,
            waypoints: JSON.parse(JSON.stringify(map.waypoints)),
            edges: JSON.parse(JSON.stringify(map.edges)),
            terrain: map.terrain ? JSON.parse(JSON.stringify(map.terrain)) : null
        };
        
        // Remove any future history if we're not at the end
        if (this.historyIndex < this.history.length - 1) {
            this.history = this.history.slice(0, this.historyIndex + 1);
        }
        
        // Add new snapshot
        this.history.push(snapshot);
        this.historyIndex = this.history.length - 1;
        
        // Mark that we have unsaved changes (the mutation about to happen)
        this.hasUnsavedChanges = true;
        
        // Limit history size
        if (this.history.length > MAX_HISTORY_SIZE) {
            this.history.shift();
            this.historyIndex--;
        }
        
        this.eventBus.emit('history:changed', this.getHistoryInfo());
    }
    
    /**
     * Undo last change
     * @returns {boolean} True if undo was performed
     */
    undo() {
        if (this.history.length === 0) return false;
        
        // If we have unsaved changes, save current state for redo first
        // (because pushHistory saves state BEFORE mutations, current state isn't in history yet)
        if (this.hasUnsavedChanges) {
            const map = this.getCurrentMap();
            if (map) {
                const snapshot = {
                    mapId: map.id,
                    waypoints: JSON.parse(JSON.stringify(map.waypoints)),
                    edges: JSON.parse(JSON.stringify(map.edges)),
                    terrain: map.terrain ? JSON.parse(JSON.stringify(map.terrain)) : null
                };
                this.history.push(snapshot);
                this.historyIndex = this.history.length - 1; // Point to the just-saved state
            }
            this.hasUnsavedChanges = false;
        }
        
        // Can't undo if already at the beginning
        if (this.historyIndex <= 0) return false;
        
        this.historyIndex--;
        this.restoreFromHistory();
        this.eventBus.emit('history:changed', this.getHistoryInfo());
        return true;
    }
    
    /**
     * Redo previously undone change
     * @returns {boolean} True if redo was performed
     */
    redo() {
        if (this.historyIndex >= this.history.length - 1) return false;
        
        this.historyIndex++;
        this.restoreFromHistory();
        this.eventBus.emit('history:changed', this.getHistoryInfo());
        return true;
    }
    
    /**
     * Restore map state from current history position
     */
    restoreFromHistory() {
        const snapshot = this.history[this.historyIndex];
        if (!snapshot) return;
        
        const map = this.state.maps[snapshot.mapId];
        if (!map) return;
        
        this.isRestoringHistory = true;
        
        // Restore mutable data
        const updatedMap = {
            ...map,
            waypoints: JSON.parse(JSON.stringify(snapshot.waypoints)),
            edges: JSON.parse(JSON.stringify(snapshot.edges)),
            terrain: snapshot.terrain ? JSON.parse(JSON.stringify(snapshot.terrain)) : null
        };
        
        this.setMap(updatedMap);
        
        // Clear selections that may no longer be valid
        const waypointIds = new Set(updatedMap.waypoints.map(wp => wp.id));
        const edgeIds = new Set(updatedMap.edges.map(e => e.id));
        
        if (this.state.selectedWaypoint && !waypointIds.has(this.state.selectedWaypoint)) {
            this.state.selectedWaypoint = null;
        }
        if (this.state.selectedEdge && !edgeIds.has(this.state.selectedEdge)) {
            this.state.selectedEdge = null;
        }
        
        this.isRestoringHistory = false;
        
        this.eventBus.emit('history:changed', this.getHistoryInfo());
        this.eventBus.emit('map:changed');
    }
    
    /**
     * Get undo/redo availability info
     * @returns {{canUndo: boolean, canRedo: boolean}}
     */
    getHistoryInfo() {
        // Can undo if there's history AND either:
        // - we have unsaved changes to undo, OR
        // - we're not at the very beginning of history
        const canUndo = this.history.length > 0 && 
            (this.hasUnsavedChanges || this.historyIndex > 0);
        return {
            canUndo,
            canRedo: this.historyIndex < this.history.length - 1
        };
    }
    
    /**
     * Clear history (e.g., when switching maps)
     */
    clearHistory() {
        this.history = [];
        this.historyIndex = -1;
        this.hasUnsavedChanges = false;
        this.eventBus.emit('history:changed', this.getHistoryInfo());
    }
    
    /**
     * Update state with partial changes
     * Emits 'state:change' event with changed keys
     * @param {Partial<AppState>} changes 
     */
    setState(changes) {
        const changedKeys = [];
        const oldState = { ...this.state };
        
        for (const [key, value] of Object.entries(changes)) {
            if (this.state[key] !== value) {
                this.state[key] = value;
                changedKeys.push(key);
            }
        }
        
        if (changedKeys.length > 0) {
            this.eventBus.emit('state:change', {
                changedKeys,
                oldState,
                newState: this.state
            });
            
            // Emit specific events for common changes
            if (changedKeys.includes('currentMapId')) {
                this.eventBus.emit('map:changed', this.state.currentMapId);
            }
            if (changedKeys.includes('selectedWaypoint') || changedKeys.includes('selectedEdge')) {
                this.eventBus.emit('selection:changed', {
                    waypoint: this.state.selectedWaypoint,
                    edge: this.state.selectedEdge
                });
            }
            if (changedKeys.includes('routeStart') || changedKeys.includes('routeEnd')) {
                this.eventBus.emit('route:changed', {
                    start: this.state.routeStart,
                    end: this.state.routeEnd
                });
            }
            if (changedKeys.includes('maps')) {
                this.eventBus.emit('maps:updated', this.state.maps);
            }
        }
    }
    
    /**
     * Get a specific map by ID
     * @param {string} mapId 
     * @returns {import('../models/Map.js').MapData|null}
     */
    getMap(mapId) {
        return this.state.maps[mapId] || null;
    }
    
    /**
     * Get the currently active map
     * @returns {import('../models/Map.js').MapData|null}
     */
    getCurrentMap() {
        if (!this.state.currentMapId) return null;
        return this.getMap(this.state.currentMapId);
    }
    
    /**
     * Add or update a map
     * @param {import('../models/Map.js').MapData} map 
     */
    setMap(map) {
        const maps = { ...this.state.maps, [map.id]: map };
        this.setState({ maps });
    }
    
    /**
     * Delete a map
     * @param {string} mapId 
     */
    deleteMap(mapId) {
        const maps = { ...this.state.maps };
        delete maps[mapId];
        
        const changes = { maps };
        if (this.state.currentMapId === mapId) {
            changes.currentMapId = null;
        }
        
        this.setState(changes);
    }
    
    /**
     * Add a waypoint to the current map
     * @param {import('../models/Waypoint.js').WaypointData} waypoint 
     */
    addWaypoint(waypoint) {
        const map = this.getCurrentMap();
        if (!map) return;
        
        this.pushHistory();
        
        const updatedMap = {
            ...map,
            waypoints: [...map.waypoints, waypoint]
        };
        this.setMap(updatedMap);
        this.eventBus.emit('waypoint:added', waypoint);
    }
    
    /**
     * Update a waypoint in the current map
     * @param {string} waypointId 
     * @param {Partial<import('../models/Waypoint.js').WaypointData>} changes 
     * @param {boolean} [recordHistory=true] - Whether to record in undo history
     */
    updateWaypoint(waypointId, changes, recordHistory = true) {
        const map = this.getCurrentMap();
        if (!map) return;
        
        if (recordHistory) this.pushHistory();
        
        const updatedMap = {
            ...map,
            waypoints: map.waypoints.map(wp => 
                wp.id === waypointId ? { ...wp, ...changes } : wp
            )
        };
        this.setMap(updatedMap);
        this.eventBus.emit('waypoint:updated', { id: waypointId, changes });
    }
    
    /**
     * Delete a waypoint from the current map
     * @param {string} waypointId 
     */
    deleteWaypoint(waypointId) {
        const map = this.getCurrentMap();
        if (!map) return;
        
        this.pushHistory();
        
        // Also delete any edges connected to this waypoint
        const updatedMap = {
            ...map,
            waypoints: map.waypoints.filter(wp => wp.id !== waypointId),
            edges: map.edges.filter(e => e.from !== waypointId && e.to !== waypointId)
        };
        this.setMap(updatedMap);
        
        // Clear selection if deleted waypoint was selected
        if (this.state.selectedWaypoint === waypointId) {
            this.setState({ selectedWaypoint: null });
        }
        
        this.eventBus.emit('waypoint:deleted', waypointId);
    }
    
    /**
     * Add an edge to the current map
     * @param {import('../models/Edge.js').EdgeData} edge 
     */
    addEdge(edge) {
        const map = this.getCurrentMap();
        if (!map) return;
        
        this.pushHistory();
        
        const updatedMap = {
            ...map,
            edges: [...map.edges, edge]
        };
        this.setMap(updatedMap);
        this.eventBus.emit('edge:added', edge);
    }
    
    /**
     * Update an edge in the current map
     * @param {string} edgeId 
     * @param {Partial<import('../models/Edge.js').EdgeData>} changes 
     * @param {boolean} [recordHistory=true] - Whether to record in undo history
     */
    updateEdge(edgeId, changes, recordHistory = true) {
        const map = this.getCurrentMap();
        if (!map) return;
        
        if (recordHistory) this.pushHistory();
        
        const updatedMap = {
            ...map,
            edges: map.edges.map(e => 
                e.id === edgeId ? { ...e, ...changes } : e
            )
        };
        this.setMap(updatedMap);
        this.eventBus.emit('edge:updated', { id: edgeId, changes });
    }
    
    /**
     * Delete an edge from the current map
     * @param {string} edgeId 
     */
    deleteEdge(edgeId) {
        const map = this.getCurrentMap();
        if (!map) return;
        
        this.pushHistory();
        
        const updatedMap = {
            ...map,
            edges: map.edges.filter(e => e.id !== edgeId)
        };
        this.setMap(updatedMap);
        
        // Clear selection if deleted edge was selected
        if (this.state.selectedEdge === edgeId) {
            this.setState({ selectedEdge: null });
        }
        
        this.eventBus.emit('edge:deleted', edgeId);
    }
    
    /**
     * Update terrain layer for the current map
     * @param {import('../models/Terrain.js').TerrainLayer} terrain 
     * @param {boolean} [recordHistory=false] - Whether to record in undo history (default false for paint strokes)
     */
    setTerrain(terrain, recordHistory = false) {
        const map = this.getCurrentMap();
        if (!map) return;
        
        if (recordHistory) this.pushHistory();
        
        const updatedMap = {
            ...map,
            terrain
        };
        this.setMap(updatedMap);
        this.eventBus.emit('terrain:updated', terrain);
    }
    
    /**
     * Get terrain layer for the current map
     * @returns {import('../models/Terrain.js').TerrainLayer|null}
     */
    getTerrain() {
        const map = this.getCurrentMap();
        return map ? map.terrain : null;
    }
    
    /**
     * Get a waypoint by ID from the current map
     * @param {string} waypointId 
     * @returns {import('../models/Waypoint.js').WaypointData|null}
     */
    getWaypoint(waypointId) {
        const map = this.getCurrentMap();
        if (!map) return null;
        return map.waypoints.find(wp => wp.id === waypointId) || null;
    }
    
    /**
     * Get an edge by ID from the current map
     * @param {string} edgeId 
     * @returns {import('../models/Edge.js').EdgeData|null}
     */
    getEdge(edgeId) {
        const map = this.getCurrentMap();
        if (!map) return null;
        return map.edges.find(e => e.id === edgeId) || null;
    }
    
    /**
     * Reset to default state
     */
    reset() {
        this.state = { ...DEFAULT_STATE };
        this.eventBus.emit('state:reset');
    }
    
    /**
     * Load state from serialized data
     * @param {Object} data 
     */
    loadFromData(data) {
        if (data.maps) {
            this.state.maps = data.maps;
        }
        this.eventBus.emit('state:loaded');
    }
    
    /**
     * Get serializable data for storage
     * @returns {Object}
     */
    getSerializableData() {
        return {
            maps: this.state.maps
        };
    }
}
