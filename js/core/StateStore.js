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

export class StateStore {
    /**
     * @param {import('./EventBus.js').EventBus} eventBus 
     */
    constructor(eventBus) {
        this.eventBus = eventBus;
        /** @type {AppState} */
        this.state = { ...DEFAULT_STATE };
    }
    
    /**
     * Get the current state
     * @returns {AppState}
     */
    getState() {
        return this.state;
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
     */
    updateWaypoint(waypointId, changes) {
        const map = this.getCurrentMap();
        if (!map) return;
        
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
     */
    updateEdge(edgeId, changes) {
        const map = this.getCurrentMap();
        if (!map) return;
        
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
