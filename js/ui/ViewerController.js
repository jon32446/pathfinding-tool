/**
 * ViewerController - Handles view mode interactions and pathfinding
 */

import { $, show, hide } from '../utils/dom.js';
import { pointInCircle } from '../utils/geometry.js';

const WAYPOINT_HIT_RADIUS = 12;

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
        
        container.addEventListener('click', (e) => this.handleClick(e));
        container.addEventListener('dblclick', (e) => this.handleDoubleClick(e));
        
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
     * Handle click on canvas
     * @param {MouseEvent} e 
     */
    handleClick(e) {
        if (!this.isActive) return;
        if (e.button !== 0) return;
        
        const map = this.store.getCurrentMap();
        if (!map) return;
        
        const canvasPos = this.renderer.screenToCanvas(e.clientX, e.clientY);
        
        // Find clicked waypoint
        const clickedWaypoint = map.waypoints.find(wp => 
            pointInCircle(canvasPos.x, canvasPos.y, wp.x, wp.y, WAYPOINT_HIT_RADIUS)
        );
        
        if (!clickedWaypoint) return;
        
        const state = this.store.getState();
        
        // First click sets start, second sets end
        if (!state.routeStart) {
            this.store.setState({ routeStart: clickedWaypoint.id });
        } else if (!state.routeEnd && clickedWaypoint.id !== state.routeStart) {
            this.store.setState({ routeEnd: clickedWaypoint.id });
        } else if (clickedWaypoint.id === state.routeStart) {
            // Clicking start again clears it
            this.store.setState({ routeStart: null, routeEnd: null });
            this.clearRouteDisplay();
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
        const btn = $('findRouteBtn');
        btn.disabled = !(state.routeStart && state.routeEnd);
    }
    
    /**
     * Find and display route
     */
    findRoute() {
        const state = this.store.getState();
        const map = this.store.getCurrentMap();
        
        if (!map || !state.routeStart || !state.routeEnd) return;
        
        // Build graph for pathfinder
        const graph = this.pathfinder.buildGraph(map.waypoints, map.edges);
        
        // Find shortest path
        const result = this.pathfinder.findKShortestPaths(
            graph,
            state.routeStart,
            state.routeEnd,
            2 // Find 2 paths (primary + alternative)
        );
        
        if (result.paths.length === 0) {
            alert('No route found between these points.');
            return;
        }
        
        // Store routes in state
        this.store.setState({
            currentRoute: result.paths[0],
            alternativeRoute: result.paths[1] || null
        });
        
        // Display routes
        this.displayRoute(result.paths[0], result.paths[1]);
        
        // Update UI
        this.updateRouteInfo(result.paths[0], result.paths[1]);
    }
    
    /**
     * Display routes on the canvas
     * @param {Object} primaryRoute 
     * @param {Object|null} alternativeRoute 
     */
    displayRoute(primaryRoute, alternativeRoute) {
        this.renderer.renderRoutes(
            primaryRoute ? primaryRoute.path : null,
            alternativeRoute ? alternativeRoute.path : null
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
        this.clearRouteDisplay();
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
