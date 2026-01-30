/**
 * CanvasRenderer - Handles map image display and SVG overlay rendering
 * 
 * Uses an <img> element for the map background and SVG for interactive
 * elements (waypoints, edges, routes).
 */

import { createSvgElement, setAttributes, clearElement, $ } from '../utils/dom.js';
import { clamp } from '../utils/helpers.js';
import { screenToCanvas } from '../utils/geometry.js';

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 5;
const ZOOM_STEP = 0.1;
const WAYPOINT_RADIUS = 8;
const EDGE_WIDTH = 3;

export class CanvasRenderer {
    /**
     * @param {import('../core/EventBus.js').EventBus} eventBus 
     * @param {import('../core/StateStore.js').StateStore} store 
     */
    constructor(eventBus, store) {
        this.eventBus = eventBus;
        this.store = store;
        
        // DOM elements
        this.container = null;
        this.wrapper = null;
        this.mapImage = null;
        this.svgOverlay = null;
        
        // SVG groups for layering
        this.edgesGroup = null;
        this.routesGroup = null;
        this.waypointsGroup = null;
        this.controlPointsGroup = null;
        this.ghostGroup = null;
        
        // Element caches
        this.waypointElements = new Map();
        this.edgeElements = new Map();
        
        // Panning state
        this.isPanning = false;
        this.panStart = { x: 0, y: 0 };
        this.lastPan = { x: 0, y: 0 };
    }
    
    /**
     * Initialize the renderer
     */
    init() {
        this.container = $('canvasContainer');
        this.wrapper = $('canvasWrapper');
        this.mapImage = $('mapImage');
        this.svgOverlay = $('svgOverlay');
        
        // Create SVG groups for proper layering
        this.edgesGroup = createSvgElement('g', { class: 'edges-group' });
        this.routesGroup = createSvgElement('g', { class: 'routes-group' });
        this.waypointsGroup = createSvgElement('g', { class: 'waypoints-group' });
        this.controlPointsGroup = createSvgElement('g', { class: 'control-points-group' });
        this.ghostGroup = createSvgElement('g', { class: 'ghost-group' });
        
        this.svgOverlay.appendChild(this.edgesGroup);
        this.svgOverlay.appendChild(this.routesGroup);
        this.svgOverlay.appendChild(this.waypointsGroup);
        this.svgOverlay.appendChild(this.controlPointsGroup);
        this.svgOverlay.appendChild(this.ghostGroup);
        
        this.setupEventListeners();
        this.setupZoomControls();
    }
    
    /**
     * Set up event listeners for pan/zoom
     */
    setupEventListeners() {
        // Mouse wheel zoom
        this.container.addEventListener('wheel', (e) => {
            e.preventDefault();
            const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
            this.zoomAt(e.clientX, e.clientY, delta);
        }, { passive: false });
        
        // Middle mouse button pan
        this.container.addEventListener('mousedown', (e) => {
            if (e.button === 1) { // Middle mouse
                e.preventDefault();
                this.startPan(e.clientX, e.clientY);
            }
        });
        
        // Prevent native image drag
        this.container.addEventListener('dragstart', (e) => {
            e.preventDefault();
        });
        
        // Space + drag pan (handled by EditorController)
        
        document.addEventListener('mousemove', (e) => {
            if (this.isPanning) {
                this.updatePan(e.clientX, e.clientY);
            }
        });
        
        document.addEventListener('mouseup', (e) => {
            if (e.button === 1 && this.isPanning) {
                this.endPan();
            }
        });
        
        // Listen for state changes
        this.eventBus.on('state:change', ({ changedKeys }) => {
            if (changedKeys.includes('zoom') || changedKeys.includes('pan')) {
                this.updateTransform();
            }
        });
        
        this.eventBus.on('map:changed', () => {
            this.renderCurrentMap();
        });
        
        this.eventBus.on('waypoint:added', () => this.renderWaypoints());
        this.eventBus.on('waypoint:updated', () => {
            this.renderWaypoints();
            this.renderEdges(); // Edges depend on waypoint positions
        });
        this.eventBus.on('waypoint:deleted', () => this.renderWaypoints());
        this.eventBus.on('edge:added', () => this.renderEdges());
        this.eventBus.on('edge:updated', () => {
            this.renderEdges();
            this.updateSelection(); // Refresh control points if edge type changed
        });
        this.eventBus.on('edge:deleted', () => this.renderEdges());
        this.eventBus.on('selection:changed', () => this.updateSelection());
        this.eventBus.on('route:changed', () => this.updateSelection());
        
        // Zoom events
        this.eventBus.on('zoom:in', () => this.zoom(ZOOM_STEP));
        this.eventBus.on('zoom:out', () => this.zoom(-ZOOM_STEP));
        this.eventBus.on('zoom:reset', () => this.resetZoom());
        this.eventBus.on('zoom:fit', () => this.fitToView());
    }
    
    /**
     * Set up zoom control buttons
     */
    setupZoomControls() {
        $('zoomInBtn').addEventListener('click', () => this.zoom(ZOOM_STEP));
        $('zoomOutBtn').addEventListener('click', () => this.zoom(-ZOOM_STEP));
        $('zoomFitBtn').addEventListener('click', () => this.fitToView());
    }
    
    /**
     * Load and display a map
     * @param {string} mapId 
     */
    loadMap(mapId) {
        const map = this.store.getMap(mapId);
        if (!map) {
            this.clearCanvas();
            return;
        }
        
        // Show map image
        this.mapImage.src = map.imageData;
        this.mapImage.classList.remove('hidden');
        
        // Set SVG size to match image
        this.mapImage.onload = () => {
            setAttributes(this.svgOverlay, {
                width: map.imageWidth,
                height: map.imageHeight,
                viewBox: `0 0 ${map.imageWidth} ${map.imageHeight}`
            });
            
            // Hide empty state
            $('canvasEmptyState').classList.add('hidden');
            
            // Render map content
            this.renderWaypoints();
            this.renderEdges();
            
            // Fit to view
            this.fitToView();
            
            // Update status
            this.updateStatus();
        };
    }
    
    /**
     * Clear the canvas
     */
    clearCanvas() {
        this.mapImage.src = '';
        this.mapImage.classList.add('hidden');
        clearElement(this.edgesGroup);
        clearElement(this.routesGroup);
        clearElement(this.waypointsGroup);
        clearElement(this.controlPointsGroup);
        clearElement(this.ghostGroup);
        this.waypointElements.clear();
        this.edgeElements.clear();
        $('canvasEmptyState').classList.remove('hidden');
    }
    
    /**
     * Render the current map
     */
    renderCurrentMap() {
        const state = this.store.getState();
        if (state.currentMapId) {
            this.loadMap(state.currentMapId);
        } else {
            this.clearCanvas();
        }
    }
    
    /**
     * Render all waypoints
     */
    renderWaypoints() {
        const map = this.store.getCurrentMap();
        if (!map) return;
        
        clearElement(this.waypointsGroup);
        this.waypointElements.clear();
        
        const state = this.store.getState();
        
        map.waypoints.forEach(waypoint => {
            const group = this.createWaypointElement(waypoint, state);
            this.waypointsGroup.appendChild(group);
            this.waypointElements.set(waypoint.id, group);
        });
        
        this.updateStatus();
    }
    
    /**
     * Create SVG element for a waypoint
     * @param {import('../models/Waypoint.js').WaypointData} waypoint 
     * @param {Object} state 
     * @returns {SVGGElement}
     */
    createWaypointElement(waypoint, state) {
        const group = createSvgElement('g', {
            class: 'waypoint',
            'data-id': waypoint.id,
            transform: `translate(${waypoint.x}, ${waypoint.y})`
        });
        
        // Add classes based on state
        if (state.selectedWaypoint === waypoint.id) {
            group.classList.add('selected');
        }
        if (state.routeStart === waypoint.id) {
            group.classList.add('start');
        }
        if (state.routeEnd === waypoint.id) {
            group.classList.add('end');
        }
        if (waypoint.isPortal) {
            group.classList.add('portal');
        }
        
        // Main circle
        const circle = createSvgElement('circle', {
            class: 'waypoint-circle',
            cx: 0,
            cy: 0,
            r: WAYPOINT_RADIUS
        });
        group.appendChild(circle);
        
        // Portal indicator (outer ring)
        if (waypoint.isPortal) {
            const portalRing = createSvgElement('circle', {
                cx: 0,
                cy: 0,
                r: WAYPOINT_RADIUS + 4,
                fill: 'none',
                stroke: 'var(--color-portal)',
                'stroke-width': 2,
                'stroke-dasharray': '4 2'
            });
            group.appendChild(portalRing);
        }
        
        // Label
        if (waypoint.name) {
            const label = createSvgElement('text', {
                class: 'waypoint-label',
                x: 0,
                y: WAYPOINT_RADIUS + 14
            });
            label.textContent = waypoint.name;
            group.appendChild(label);
        }
        
        return group;
    }
    
    /**
     * Render all edges
     */
    renderEdges() {
        const map = this.store.getCurrentMap();
        if (!map) return;
        
        clearElement(this.edgesGroup);
        this.edgeElements.clear();
        
        const state = this.store.getState();
        const waypointMap = new Map(map.waypoints.map(wp => [wp.id, wp]));
        
        // Calculate cost range for color gradient
        const costRange = this.calculateCostRange(map.edges);
        
        map.edges.forEach(edge => {
            const fromWp = waypointMap.get(edge.from);
            const toWp = waypointMap.get(edge.to);
            if (!fromWp || !toWp) return;
            
            const group = this.createEdgeElement(edge, fromWp, toWp, state, costRange);
            this.edgesGroup.appendChild(group);
            this.edgeElements.set(edge.id, group);
        });
        
        this.updateStatus();
    }
    
    /**
     * Calculate min and max costs from edges
     * @param {import('../models/Edge.js').EdgeData[]} edges 
     * @returns {{min: number, max: number}}
     */
    calculateCostRange(edges) {
        if (edges.length === 0) {
            return { min: 0, max: 1 };
        }
        
        let min = Infinity;
        let max = -Infinity;
        
        edges.forEach(edge => {
            min = Math.min(min, edge.cost);
            max = Math.max(max, edge.cost);
        });
        
        // Avoid division by zero if all edges have same cost
        if (min === max) {
            return { min: min, max: min + 1 };
        }
        
        return { min, max };
    }
    
    /**
     * Get color for an edge based on its cost relative to the range
     * Uses the "inferno" colormap - perceptually uniform, dark to bright
     * @param {number} cost 
     * @param {{min: number, max: number}} range 
     * @returns {string} RGB color string
     */
    getCostColor(cost, range) {
        // Normalize cost to 0-1
        const t = (cost - range.min) / (range.max - range.min);
        
        // Inferno colormap stops (approximate)
        // Dark purple → magenta → red-orange → orange → yellow
        const stops = [
            { t: 0.00, r: 0,   g: 0,   b: 4   },   // almost black
            { t: 0.15, r: 40,  g: 11,  b: 84  },   // dark purple
            { t: 0.30, r: 101, g: 21,  b: 110 },   // purple
            { t: 0.45, r: 159, g: 42,  b: 99  },   // magenta
            { t: 0.60, r: 212, g: 72,  b: 66  },   // red-orange
            { t: 0.75, r: 245, g: 125, b: 21  },   // orange
            { t: 0.90, r: 250, g: 193, b: 39  },   // yellow-orange
            { t: 1.00, r: 252, g: 255, b: 164 }    // pale yellow
        ];
        
        // Find the two stops to interpolate between
        let lower = stops[0];
        let upper = stops[stops.length - 1];
        
        for (let i = 0; i < stops.length - 1; i++) {
            if (t >= stops[i].t && t <= stops[i + 1].t) {
                lower = stops[i];
                upper = stops[i + 1];
                break;
            }
        }
        
        // Interpolate between the two stops
        const range_t = upper.t - lower.t;
        const local_t = range_t > 0 ? (t - lower.t) / range_t : 0;
        
        const r = Math.round(lower.r + (upper.r - lower.r) * local_t);
        const g = Math.round(lower.g + (upper.g - lower.g) * local_t);
        const b = Math.round(lower.b + (upper.b - lower.b) * local_t);
        
        return `rgb(${r}, ${g}, ${b})`;
    }
    
    /**
     * Create SVG element for an edge
     * @param {import('../models/Edge.js').EdgeData} edge 
     * @param {import('../models/Waypoint.js').WaypointData} fromWp 
     * @param {import('../models/Waypoint.js').WaypointData} toWp 
     * @param {Object} state 
     * @param {{min: number, max: number}} costRange
     * @returns {SVGGElement}
     */
    createEdgeElement(edge, fromWp, toWp, state, costRange) {
        const group = createSvgElement('g', {
            class: 'edge',
            'data-id': edge.id
        });
        
        if (state.selectedEdge === edge.id) {
            group.classList.add('selected');
        }
        
        // Create path based on edge type
        let pathData;
        if (edge.type === 'bezier' && edge.controlPoints && edge.controlPoints.length >= 2) {
            const [cp1, cp2] = edge.controlPoints;
            pathData = `M ${fromWp.x} ${fromWp.y} C ${cp1.x} ${cp1.y}, ${cp2.x} ${cp2.y}, ${toWp.x} ${toWp.y}`;
        } else {
            pathData = `M ${fromWp.x} ${fromWp.y} L ${toWp.x} ${toWp.y}`;
        }
        
        // Calculate color based on cost
        const edgeColor = this.getCostColor(edge.cost, costRange);
        
        const path = createSvgElement('path', {
            class: 'edge-line',
            d: pathData,
            stroke: edgeColor
        });
        group.appendChild(path);
        
        // Hit area (wider invisible path for easier clicking)
        const hitArea = createSvgElement('path', {
            d: pathData,
            fill: 'none',
            stroke: 'transparent',
            'stroke-width': 15
        });
        group.appendChild(hitArea);
        
        return group;
    }
    
    /**
     * Render route paths
     * @param {Object[]} primaryRoute - Primary route edges
     * @param {Object[]} alternativeRoute - Alternative route edges
     */
    renderRoutes(primaryRoute, alternativeRoute) {
        clearElement(this.routesGroup);
        
        const map = this.store.getCurrentMap();
        if (!map) return;
        
        const waypointMap = new Map(map.waypoints.map(wp => [wp.id, wp]));
        const edgeMap = new Map(map.edges.map(e => [e.id, e]));
        
        // Render alternative route first (so it's behind)
        if (alternativeRoute && alternativeRoute.length > 0) {
            const altPath = this.createRoutePath(alternativeRoute, waypointMap, edgeMap, 'alternative');
            if (altPath) this.routesGroup.appendChild(altPath);
        }
        
        // Render primary route on top
        if (primaryRoute && primaryRoute.length > 0) {
            const primaryPath = this.createRoutePath(primaryRoute, waypointMap, edgeMap, 'primary');
            if (primaryPath) this.routesGroup.appendChild(primaryPath);
        }
    }
    
    /**
     * Create a route path element
     * @param {string[]} waypointIds - Ordered list of waypoint IDs in route
     * @param {Map} waypointMap 
     * @param {Map} edgeMap 
     * @param {string} type - 'primary' or 'alternative'
     * @returns {SVGPathElement|null}
     */
    createRoutePath(waypointIds, waypointMap, edgeMap, type) {
        if (waypointIds.length < 2) return null;
        
        const map = this.store.getCurrentMap();
        let pathData = '';
        
        for (let i = 0; i < waypointIds.length - 1; i++) {
            const fromWp = waypointMap.get(waypointIds[i]);
            const toWp = waypointMap.get(waypointIds[i + 1]);
            if (!fromWp || !toWp) continue;
            
            // Find the edge between these waypoints
            const edge = map.edges.find(e => 
                (e.from === fromWp.id && e.to === toWp.id) ||
                (e.bidirectional && e.from === toWp.id && e.to === fromWp.id)
            );
            
            if (i === 0) {
                pathData += `M ${fromWp.x} ${fromWp.y} `;
            }
            
            if (edge && edge.type === 'bezier' && edge.controlPoints && edge.controlPoints.length >= 2) {
                const [cp1, cp2] = edge.controlPoints;
                // Handle reversed direction
                if (edge.from === fromWp.id) {
                    pathData += `C ${cp1.x} ${cp1.y}, ${cp2.x} ${cp2.y}, ${toWp.x} ${toWp.y} `;
                } else {
                    // Reverse control points
                    pathData += `C ${cp2.x} ${cp2.y}, ${cp1.x} ${cp1.y}, ${toWp.x} ${toWp.y} `;
                }
            } else {
                pathData += `L ${toWp.x} ${toWp.y} `;
            }
        }
        
        return createSvgElement('path', {
            class: `route-line ${type}`,
            d: pathData
        });
    }
    
    /**
     * Clear rendered routes
     */
    clearRoutes() {
        clearElement(this.routesGroup);
    }
    
    /**
     * Render bezier control points for selected edge
     * @param {import('../models/Edge.js').EdgeData} edge 
     */
    renderControlPoints(edge) {
        clearElement(this.controlPointsGroup);
        
        if (!edge || edge.type !== 'bezier' || !edge.controlPoints) return;
        
        const map = this.store.getCurrentMap();
        if (!map) return;
        
        const fromWp = map.waypoints.find(wp => wp.id === edge.from);
        const toWp = map.waypoints.find(wp => wp.id === edge.to);
        if (!fromWp || !toWp) return;
        
        edge.controlPoints.forEach((cp, index) => {
            // Line from waypoint to control point
            const lineStart = index === 0 ? fromWp : toWp;
            const line = createSvgElement('line', {
                class: 'control-point-line',
                x1: lineStart.x,
                y1: lineStart.y,
                x2: cp.x,
                y2: cp.y
            });
            this.controlPointsGroup.appendChild(line);
            
            // Control point circle
            const circle = createSvgElement('circle', {
                class: 'control-point-circle',
                cx: cp.x,
                cy: cp.y,
                r: 6,
                'data-edge-id': edge.id,
                'data-cp-index': index
            });
            
            const group = createSvgElement('g', {
                class: 'control-point',
                'data-edge-id': edge.id,
                'data-cp-index': index
            });
            group.appendChild(circle);
            this.controlPointsGroup.appendChild(group);
        });
    }
    
    /**
     * Clear control points display
     */
    clearControlPoints() {
        clearElement(this.controlPointsGroup);
    }
    
    /**
     * Show ghost edge during edge creation
     * @param {number} x1 
     * @param {number} y1 
     * @param {number} x2 
     * @param {number} y2 
     */
    showGhostEdge(x1, y1, x2, y2) {
        clearElement(this.ghostGroup);
        
        const line = createSvgElement('line', {
            class: 'ghost-edge',
            x1, y1, x2, y2
        });
        this.ghostGroup.appendChild(line);
    }
    
    /**
     * Show ghost waypoint during waypoint placement
     * @param {number} x 
     * @param {number} y 
     */
    showGhostWaypoint(x, y) {
        clearElement(this.ghostGroup);
        
        const circle = createSvgElement('circle', {
            class: 'ghost-waypoint',
            cx: x,
            cy: y,
            r: WAYPOINT_RADIUS
        });
        this.ghostGroup.appendChild(circle);
    }
    
    /**
     * Clear ghost elements
     */
    clearGhost() {
        clearElement(this.ghostGroup);
    }
    
    /**
     * Update selection highlighting
     */
    updateSelection() {
        const state = this.store.getState();
        
        // Update waypoint selection
        this.waypointElements.forEach((el, id) => {
            el.classList.toggle('selected', state.selectedWaypoint === id);
            el.classList.toggle('start', state.routeStart === id);
            el.classList.toggle('end', state.routeEnd === id);
        });
        
        // Update edge selection
        this.edgeElements.forEach((el, id) => {
            el.classList.toggle('selected', state.selectedEdge === id);
        });
        
        // Show control points for selected bezier edge
        if (state.selectedEdge) {
            const edge = this.store.getEdge(state.selectedEdge);
            if (edge && edge.type === 'bezier') {
                this.renderControlPoints(edge);
            } else {
                this.clearControlPoints();
            }
        } else {
            this.clearControlPoints();
        }
    }
    
    /**
     * Update the transform based on zoom and pan
     */
    updateTransform() {
        const state = this.store.getState();
        this.wrapper.style.transform = `translate(${state.pan.x}px, ${state.pan.y}px) scale(${state.zoom})`;
        $('zoomLevel').textContent = `${Math.round(state.zoom * 100)}%`;
    }
    
    /**
     * Zoom by a delta amount
     * @param {number} delta 
     */
    zoom(delta) {
        const state = this.store.getState();
        const newZoom = clamp(state.zoom + delta, MIN_ZOOM, MAX_ZOOM);
        this.store.setState({ zoom: newZoom });
    }
    
    /**
     * Zoom at a specific point (for mouse wheel zoom)
     * @param {number} clientX 
     * @param {number} clientY 
     * @param {number} delta 
     */
    zoomAt(clientX, clientY, delta) {
        const state = this.store.getState();
        const rect = this.container.getBoundingClientRect();
        
        // Get mouse position relative to container
        const mouseX = clientX - rect.left;
        const mouseY = clientY - rect.top;
        
        // Calculate position in canvas coordinates before zoom
        const canvasX = (mouseX - state.pan.x) / state.zoom;
        const canvasY = (mouseY - state.pan.y) / state.zoom;
        
        // Apply zoom
        const newZoom = clamp(state.zoom + delta, MIN_ZOOM, MAX_ZOOM);
        
        // Adjust pan to keep the point under the mouse
        const newPanX = mouseX - canvasX * newZoom;
        const newPanY = mouseY - canvasY * newZoom;
        
        this.store.setState({
            zoom: newZoom,
            pan: { x: newPanX, y: newPanY }
        });
    }
    
    /**
     * Reset zoom to 100%
     */
    resetZoom() {
        this.store.setState({ zoom: 1, pan: { x: 0, y: 0 } });
    }
    
    /**
     * Fit map to view
     */
    fitToView() {
        const map = this.store.getCurrentMap();
        if (!map) return;
        
        const rect = this.container.getBoundingClientRect();
        const padding = 40;
        
        const scaleX = (rect.width - padding * 2) / map.imageWidth;
        const scaleY = (rect.height - padding * 2) / map.imageHeight;
        const zoom = Math.min(scaleX, scaleY, 1); // Don't zoom in beyond 100%
        
        const panX = (rect.width - map.imageWidth * zoom) / 2;
        const panY = (rect.height - map.imageHeight * zoom) / 2;
        
        this.store.setState({
            zoom,
            pan: { x: panX, y: panY }
        });
    }
    
    /**
     * Start panning
     * @param {number} clientX 
     * @param {number} clientY 
     */
    startPan(clientX, clientY) {
        this.isPanning = true;
        this.panStart = { x: clientX, y: clientY };
        this.lastPan = { ...this.store.getState().pan };
        this.wrapper.classList.add('grabbing');
    }
    
    /**
     * Update pan position
     * @param {number} clientX 
     * @param {number} clientY 
     */
    updatePan(clientX, clientY) {
        if (!this.isPanning) return;
        
        const dx = clientX - this.panStart.x;
        const dy = clientY - this.panStart.y;
        
        this.store.setState({
            pan: {
                x: this.lastPan.x + dx,
                y: this.lastPan.y + dy
            }
        });
    }
    
    /**
     * End panning
     */
    endPan() {
        this.isPanning = false;
        this.wrapper.classList.remove('grabbing');
    }
    
    /**
     * Convert screen coordinates to canvas coordinates
     * @param {number} clientX 
     * @param {number} clientY 
     * @returns {{x: number, y: number}}
     */
    screenToCanvas(clientX, clientY) {
        const state = this.store.getState();
        const rect = this.container.getBoundingClientRect();
        return screenToCanvas(clientX, clientY, state.pan, state.zoom, rect);
    }
    
    /**
     * Get the container rect
     * @returns {DOMRect}
     */
    getContainerRect() {
        return this.container.getBoundingClientRect();
    }
    
    /**
     * Update status bar with current map info
     */
    updateStatus() {
        const map = this.store.getCurrentMap();
        $('statusWaypoints').textContent = `Waypoints: ${map ? map.waypoints.length : 0}`;
        $('statusEdges').textContent = `Edges: ${map ? map.edges.length : 0}`;
    }
}
