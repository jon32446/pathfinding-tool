/**
 * ViewerController - Handles view mode interactions and pathfinding
 */

import { $, show, hide } from '../utils/dom.js';
import { pointInCircle, distance } from '../utils/geometry.js';
import { getTerrainCostAt, sampleLine } from '../models/Terrain.js';

const WAYPOINT_HIT_RADIUS = 12;
const NEARBY_WAYPOINT_RADIUS = 500; // Max distance to consider for virtual edges
const MAX_VIRTUAL_EDGES = 3; // Max waypoints to connect arbitrary point to

export class ViewerController {
    /**
     * @param {import('../core/EventBus.js').EventBus} eventBus 
     * @param {import('../core/StateStore.js').StateStore} store 
     * @param {import('./CanvasRenderer.js').CanvasRenderer} renderer 
     * @param {import('../engine/Pathfinder.js').Pathfinder} pathfinder 
     */
    constructor(eventBus, store, renderer, pathfinder) {
        this.eventBus = eventBus;
        this.store = store;
        this.renderer = renderer;
        this.pathfinder = pathfinder;
        
        this.isActive = false;
        this.isPanning = false;
        this.panStartedOnWaypoint = false;
        
        // Arbitrary start/end points (when not clicking on waypoints)
        this.arbitraryStart = null; // { x, y } or null
        this.arbitraryEnd = null;   // { x, y } or null
    }
    
    /**
     * Initialize the viewer
     */
    init() {
        this.setupEventListeners();
        this.setupControls();
    }
    
    /**
     * Activate view mode
     */
    activate() {
        this.isActive = true;
        this.updateFindRouteButton();
    }
    
    /**
     * Deactivate view mode
     */
    deactivate() {
        this.isActive = false;
        this.clearRoute();
    }
    
    /**
     * Set up event listeners
     */
    setupEventListeners() {
        const container = $('canvasContainer');
        
        container.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        container.addEventListener('dblclick', (e) => this.handleDoubleClick(e));
        
        document.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        document.addEventListener('mouseup', (e) => this.handleMouseUp(e));
        
        // State changes
        this.eventBus.on('state:change', ({ changedKeys }) => {
            if (changedKeys.includes('routeStart') || changedKeys.includes('routeEnd')) {
                this.updateFindRouteButton();
            }
        });
    }
    
    /**
     * Set up view mode controls
     */
    setupControls() {
        $('findRouteBtn').addEventListener('click', () => this.findRoute());
        $('clearRouteBtn').addEventListener('click', () => this.clearRoute());
    }
    
    /**
     * Handle mouse down on canvas
     * @param {MouseEvent} e 
     */
    handleMouseDown(e) {
        if (!this.isActive) return;
        if (e.button !== 0) return;
        
        const map = this.store.getCurrentMap();
        if (!map) return;
        
        const canvasPos = this.renderer.screenToCanvas(e.clientX, e.clientY);
        
        // Find clicked waypoint
        const clickedWaypoint = map.waypoints.find(wp => 
            pointInCircle(canvasPos.x, canvasPos.y, wp.x, wp.y, WAYPOINT_HIT_RADIUS)
        );
        
        // Shift+click to set arbitrary point anywhere
        if (e.shiftKey) {
            this.handleArbitraryPointClick(canvasPos, clickedWaypoint);
            return;
        }
        
        if (clickedWaypoint) {
            // Clicked on a waypoint - handle route selection
            this.panStartedOnWaypoint = true;
            this.handleWaypointClick(clickedWaypoint);
        } else {
            // Clicked on empty space - start panning
            this.panStartedOnWaypoint = false;
            this.isPanning = true;
            this.renderer.startPan(e.clientX, e.clientY);
        }
    }
    
    /**
     * Handle arbitrary point click (Shift+click)
     * @param {{x: number, y: number}} canvasPos 
     * @param {Object|undefined} clickedWaypoint 
     */
    handleArbitraryPointClick(canvasPos, clickedWaypoint) {
        const state = this.store.getState();
        const hasStart = state.routeStart || this.arbitraryStart;
        const hasEnd = state.routeEnd || this.arbitraryEnd;
        
        if (!hasStart) {
            // Set start point
            if (clickedWaypoint) {
                this.arbitraryStart = null;
                this.store.setState({ routeStart: clickedWaypoint.id });
            } else {
                this.arbitraryStart = { x: canvasPos.x, y: canvasPos.y };
                this.store.setState({ routeStart: null });
            }
        } else if (!hasEnd) {
            // Set end point
            if (clickedWaypoint) {
                this.arbitraryEnd = null;
                this.store.setState({ routeEnd: clickedWaypoint.id });
            } else {
                this.arbitraryEnd = { x: canvasPos.x, y: canvasPos.y };
                this.store.setState({ routeEnd: null });
            }
        } else {
            // Both set, clicking again clears
            this.clearRoute();
        }
        
        this.updateFindRouteButton();
        this.renderer.renderArbitraryPoints(this.arbitraryStart, this.arbitraryEnd);
    }
    
    /**
     * Handle mouse move
     * @param {MouseEvent} e 
     */
    handleMouseMove(e) {
        if (!this.isActive) return;
        if (this.isPanning) {
            this.renderer.updatePan(e.clientX, e.clientY);
        }
    }
    
    /**
     * Handle mouse up
     * @param {MouseEvent} e 
     */
    handleMouseUp(e) {
        if (!this.isActive) return;
        if (this.isPanning) {
            this.isPanning = false;
            this.renderer.endPan();
        }
    }
    
    /**
     * Handle waypoint click for route selection
     * @param {Object} clickedWaypoint 
     */
    handleWaypointClick(clickedWaypoint) {
        const state = this.store.getState();
        const hasStart = state.routeStart || this.arbitraryStart;
        
        // First click sets start, second sets end
        if (!hasStart) {
            this.arbitraryStart = null;
            this.arbitraryEnd = null;
            this.store.setState({ routeStart: clickedWaypoint.id });
            this.renderer.renderArbitraryPoints(null, null);
        } else if (!state.routeEnd && !this.arbitraryEnd && clickedWaypoint.id !== state.routeStart) {
            this.arbitraryEnd = null;
            this.store.setState({ routeEnd: clickedWaypoint.id });
        } else if (clickedWaypoint.id === state.routeStart) {
            // Clicking start again clears it
            this.store.setState({ routeStart: null, routeEnd: null });
            this.arbitraryStart = null;
            this.arbitraryEnd = null;
            this.clearRouteDisplay();
            this.renderer.renderArbitraryPoints(null, null);
        } else if (clickedWaypoint.id === state.routeEnd) {
            // Clicking end again clears just the end
            this.store.setState({ routeEnd: null });
            this.clearRouteDisplay();
        } else {
            // Clicking a different waypoint when both are set - replace end
            this.store.setState({ routeEnd: clickedWaypoint.id });
        }
    }
    
    /**
     * Handle double click (for portal navigation)
     * @param {MouseEvent} e 
     */
    handleDoubleClick(e) {
        if (!this.isActive) return;
        
        const map = this.store.getCurrentMap();
        if (!map) return;
        
        const canvasPos = this.renderer.screenToCanvas(e.clientX, e.clientY);
        
        const clickedWaypoint = map.waypoints.find(wp => 
            pointInCircle(canvasPos.x, canvasPos.y, wp.x, wp.y, WAYPOINT_HIT_RADIUS)
        );
        
        if (clickedWaypoint && clickedWaypoint.isPortal && clickedWaypoint.portalTargetMapId) {
            // Navigate to linked map
            this.eventBus.emit('map:select', clickedWaypoint.portalTargetMapId);
        }
    }
    
    /**
     * Update find route button state
     */
    updateFindRouteButton() {
        const state = this.store.getState();
        const hasStart = state.routeStart || this.arbitraryStart;
        const hasEnd = state.routeEnd || this.arbitraryEnd;
        const btn = $('findRouteBtn');
        btn.disabled = !(hasStart && hasEnd);
    }
    
    /**
     * Find and display route
     */
    findRoute() {
        const state = this.store.getState();
        const map = this.store.getCurrentMap();
        
        const hasStart = state.routeStart || this.arbitraryStart;
        const hasEnd = state.routeEnd || this.arbitraryEnd;
        
        if (!map || !hasStart || !hasEnd) return;
        
        // Build graph for pathfinder
        const graph = this.pathfinder.buildGraph(map.waypoints, map.edges);
        
        // Handle arbitrary start point
        let effectiveStartId = state.routeStart;
        let startSegment = null;
        if (this.arbitraryStart) {
            const { waypointId, cost } = this.findNearestWaypoint(this.arbitraryStart, map);
            if (!waypointId) {
                alert('No waypoints nearby. Place waypoints closer to your start point.');
                return;
            }
            effectiveStartId = waypointId;
            startSegment = { point: this.arbitraryStart, waypointId, cost };
        }
        
        // Handle arbitrary end point
        let effectiveEndId = state.routeEnd;
        let endSegment = null;
        if (this.arbitraryEnd) {
            const { waypointId, cost } = this.findNearestWaypoint(this.arbitraryEnd, map);
            if (!waypointId) {
                alert('No waypoints nearby. Place waypoints closer to your end point.');
                return;
            }
            effectiveEndId = waypointId;
            endSegment = { point: this.arbitraryEnd, waypointId, cost };
        }
        
        // Find shortest path between effective waypoints
        const result = this.pathfinder.findKShortestPaths(
            graph,
            effectiveStartId,
            effectiveEndId,
            2 // Find 2 paths (primary + alternative)
        );
        
        if (result.paths.length === 0) {
            alert('No route found between these points.');
            return;
        }
        
        // Add segment costs to total
        const primaryRoute = result.paths[0];
        if (startSegment) primaryRoute.cost += startSegment.cost;
        if (endSegment) primaryRoute.cost += endSegment.cost;
        
        const altRoute = result.paths[1];
        if (altRoute) {
            if (startSegment) altRoute.cost += startSegment.cost;
            if (endSegment) altRoute.cost += endSegment.cost;
        }
        
        // Store routes in state
        this.store.setState({
            currentRoute: result.paths[0],
            alternativeRoute: result.paths[1] || null
        });
        
        // Display routes with arbitrary endpoints
        this.displayRoute(result.paths[0], result.paths[1], startSegment, endSegment);
        
        // Update UI
        this.updateRouteInfo(result.paths[0], result.paths[1]);
    }
    
    /**
     * Display routes on the canvas
     * @param {Object} primaryRoute 
     * @param {Object|null} alternativeRoute 
     * @param {Object|null} startSegment - { point: {x,y}, waypointId }
     * @param {Object|null} endSegment - { point: {x,y}, waypointId }
     */
    displayRoute(primaryRoute, alternativeRoute, startSegment = null, endSegment = null) {
        this.renderer.renderRoutes(
            primaryRoute ? primaryRoute.path : null,
            alternativeRoute ? alternativeRoute.path : null,
            startSegment,
            endSegment
        );
    }
    
    /**
     * Update route info display
     * @param {Object} primaryRoute 
     * @param {Object|null} alternativeRoute 
     */
    updateRouteInfo(primaryRoute, alternativeRoute) {
        const primaryCard = $('primaryRouteCard');
        const altCard = $('altRouteCard');
        
        if (primaryRoute) {
            show(primaryCard);
            $('primaryRouteCost').textContent = this.formatCost(primaryRoute.cost);
        } else {
            hide(primaryCard);
        }
        
        if (alternativeRoute) {
            show(altCard);
            $('altRouteCost').textContent = this.formatCost(alternativeRoute.cost);
        } else {
            hide(altCard);
        }
    }
    
    /**
     * Format cost for display
     * @param {number} cost 
     * @returns {string}
     */
    formatCost(cost) {
        if (cost < 10) {
            return cost.toFixed(1);
        }
        return Math.round(cost).toString();
    }
    
    /**
     * Clear route selection and display
     */
    clearRoute() {
        this.store.setState({
            routeStart: null,
            routeEnd: null,
            currentRoute: null,
            alternativeRoute: null
        });
        this.arbitraryStart = null;
        this.arbitraryEnd = null;
        this.clearRouteDisplay();
        this.renderer.renderArbitraryPoints(null, null);
    }
    
    /**
     * Find the nearest waypoint to a point and calculate terrain cost
     * @param {{x: number, y: number}} point 
     * @param {Object} map 
     * @returns {{waypointId: string|null, cost: number}}
     */
    findNearestWaypoint(point, map) {
        let nearest = null;
        let nearestDist = Infinity;
        
        for (const wp of map.waypoints) {
            const dist = distance(point.x, point.y, wp.x, wp.y);
            if (dist < nearestDist && dist < NEARBY_WAYPOINT_RADIUS) {
                nearestDist = dist;
                nearest = wp;
            }
        }
        
        if (!nearest) {
            return { waypointId: null, cost: 0 };
        }
        
        // Calculate cost based on terrain
        let cost = nearestDist / 100; // Base cost from distance
        
        if (map.terrain) {
            // Sample terrain along the path
            const samples = sampleLine(point.x, point.y, nearest.x, nearest.y, 10);
            let terrainCost = 0;
            for (let i = 0; i < samples.length - 1; i++) {
                const midX = (samples[i].x + samples[i + 1].x) / 2;
                const midY = (samples[i].y + samples[i + 1].y) / 2;
                const segmentDist = distance(samples[i].x, samples[i].y, samples[i + 1].x, samples[i + 1].y);
                const terrainMultiplier = getTerrainCostAt(map.terrain, midX, midY, map.imageWidth, map.imageHeight);
                terrainCost += segmentDist * terrainMultiplier;
            }
            cost = terrainCost / 100;
        }
        
        return { 
            waypointId: nearest.id, 
            cost: Math.round(cost * 10) / 10 
        };
    }
    
    /**
     * Clear just the route display (not selection)
     */
    clearRouteDisplay() {
        this.renderer.clearRoutes();
        hide($('primaryRouteCard'));
        hide($('altRouteCard'));
    }
}
