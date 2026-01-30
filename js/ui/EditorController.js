/**
 * EditorController - Handles all edit mode interactions
 * 
 * Manages waypoint placement, edge creation, selection, dragging,
 * and bezier control point manipulation.
 */

import { createWaypoint } from '../models/Waypoint.js';
import { createEdge, edgeExists, convertToBezier, convertToStraight } from '../models/Edge.js';
import { $ } from '../utils/dom.js';
import { distance, distanceToLineSegment, pointInCircle } from '../utils/geometry.js';

const WAYPOINT_HIT_RADIUS = 12;
const EDGE_HIT_DISTANCE = 10;
const CONTROL_POINT_HIT_RADIUS = 10;

export class EditorController {
    /**
     * @param {import('../core/EventBus.js').EventBus} eventBus 
     * @param {import('../core/StateStore.js').StateStore} store 
     * @param {import('./CanvasRenderer.js').CanvasRenderer} renderer 
     */
    constructor(eventBus, store, renderer) {
        this.eventBus = eventBus;
        this.store = store;
        this.renderer = renderer;
        
        this.isActive = false;
        this.isDragging = false;
        this.dragTarget = null; // { type: 'waypoint'|'controlPoint', id: string, index?: number }
        this.dragStart = { x: 0, y: 0 };
        this.originalPosition = null;
        
        // Edge creation state
        this.edgeStartWaypoint = null;
        
        // Space pan state
        this.spacePressed = false;
    }
    
    /**
     * Initialize the editor
     */
    init() {
        this.setupEventListeners();
        this.setupToolbar();
    }
    
    /**
     * Activate edit mode
     */
    activate() {
        this.isActive = true;
        this.clearEdgeCreation();
    }
    
    /**
     * Deactivate edit mode
     */
    deactivate() {
        this.isActive = false;
        this.clearEdgeCreation();
        this.renderer.clearGhost();
    }
    
    /**
     * Set up event listeners
     */
    setupEventListeners() {
        const container = $('canvasContainer');
        const svgOverlay = $('svgOverlay');
        
        // Mouse events on canvas
        container.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        container.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        container.addEventListener('mouseup', (e) => this.handleMouseUp(e));
        container.addEventListener('dblclick', (e) => this.handleDoubleClick(e));
        
        // Right-click context menu
        container.addEventListener('contextmenu', (e) => this.handleContextMenu(e));
        
        // Keyboard events
        document.addEventListener('keydown', (e) => this.handleKeyDown(e));
        document.addEventListener('keyup', (e) => this.handleKeyUp(e));
        
        // Tool selection events
        this.eventBus.on('tool:select', (tool) => this.selectTool(tool));
        
        // Action events
        this.eventBus.on('action:cancel', () => this.handleCancel());
        this.eventBus.on('action:delete', () => this.handleDelete());
        this.eventBus.on('action:make-bezier', () => this.convertSelectedToBezier());
        this.eventBus.on('action:make-straight', () => this.convertSelectedToStraight());
    }
    
    /**
     * Set up toolbar buttons
     */
    setupToolbar() {
        const toolButtons = document.querySelectorAll('.tool-btn[data-tool]');
        toolButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const tool = btn.dataset.tool;
                this.eventBus.emit('tool:select', tool);
            });
        });
    }
    
    /**
     * Select a tool
     * @param {string} tool 
     */
    selectTool(tool) {
        this.store.setState({ currentTool: tool });
        
        // Update toolbar UI
        document.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tool === tool);
        });
        
        // Update status
        const toolNames = {
            select: 'Select Tool',
            waypoint: 'Add Waypoint',
            edge: 'Add Edge',
            pan: 'Pan Tool'
        };
        $('statusTool').textContent = toolNames[tool] || 'Unknown Tool';
        
        // Clear edge creation when switching tools
        if (tool !== 'edge') {
            this.clearEdgeCreation();
        }
        
        // Clear ghost
        this.renderer.clearGhost();
    }
    
    /**
     * Handle mouse down
     * @param {MouseEvent} e 
     */
    handleMouseDown(e) {
        if (!this.isActive) return;
        if (e.button !== 0) return; // Left click only
        
        const state = this.store.getState();
        const canvasPos = this.renderer.screenToCanvas(e.clientX, e.clientY);
        
        // Space + drag for pan
        if (this.spacePressed || state.currentTool === 'pan') {
            this.renderer.startPan(e.clientX, e.clientY);
            return;
        }
        
        const map = this.store.getCurrentMap();
        if (!map) return;
        
        // Check what was clicked
        const hitResult = this.hitTest(canvasPos.x, canvasPos.y, map);
        
        switch (state.currentTool) {
            case 'select':
                this.handleSelectToolClick(hitResult, canvasPos, e);
                break;
            case 'waypoint':
                this.handleWaypointToolClick(canvasPos);
                break;
            case 'edge':
                this.handleEdgeToolClick(hitResult, canvasPos);
                break;
        }
    }
    
    /**
     * Handle mouse move
     * @param {MouseEvent} e 
     */
    handleMouseMove(e) {
        if (!this.isActive) return;
        
        const state = this.store.getState();
        const canvasPos = this.renderer.screenToCanvas(e.clientX, e.clientY);
        
        // Handle dragging
        if (this.isDragging && this.dragTarget) {
            this.handleDrag(canvasPos);
            return;
        }
        
        // Handle edge creation preview
        if (state.currentTool === 'edge' && this.edgeStartWaypoint) {
            const startWp = this.store.getWaypoint(this.edgeStartWaypoint);
            if (startWp) {
                this.renderer.showGhostEdge(startWp.x, startWp.y, canvasPos.x, canvasPos.y);
            }
        }
        
        // Handle waypoint tool preview
        if (state.currentTool === 'waypoint') {
            this.renderer.showGhostWaypoint(canvasPos.x, canvasPos.y);
        }
    }
    
    /**
     * Handle mouse up
     * @param {MouseEvent} e 
     */
    handleMouseUp(e) {
        if (this.isDragging) {
            this.endDrag();
        }
        
        if (this.renderer.isPanning) {
            this.renderer.endPan();
        }
    }
    
    /**
     * Handle double click (for renaming waypoints)
     * @param {MouseEvent} e 
     */
    handleDoubleClick(e) {
        if (!this.isActive) return;
        
        const canvasPos = this.renderer.screenToCanvas(e.clientX, e.clientY);
        const map = this.store.getCurrentMap();
        if (!map) return;
        
        const hitResult = this.hitTest(canvasPos.x, canvasPos.y, map);
        
        if (hitResult.type === 'waypoint') {
            this.promptRenameWaypoint(hitResult.id);
        }
    }
    
    /**
     * Handle context menu (right-click)
     * @param {MouseEvent} e 
     */
    handleContextMenu(e) {
        if (!this.isActive) return;
        e.preventDefault();
        
        const canvasPos = this.renderer.screenToCanvas(e.clientX, e.clientY);
        const map = this.store.getCurrentMap();
        if (!map) return;
        
        const hitResult = this.hitTest(canvasPos.x, canvasPos.y, map);
        
        if (hitResult.type === 'waypoint' || hitResult.type === 'edge') {
            // Select the item
            if (hitResult.type === 'waypoint') {
                this.store.setState({ selectedWaypoint: hitResult.id, selectedEdge: null });
            } else {
                this.store.setState({ selectedWaypoint: null, selectedEdge: hitResult.id });
            }
            
            // Show context menu
            this.showContextMenu(e.clientX, e.clientY, hitResult);
        }
    }
    
    /**
     * Handle keyboard key down
     * @param {KeyboardEvent} e 
     */
    handleKeyDown(e) {
        if (e.code === 'Space' && !this.spacePressed) {
            this.spacePressed = true;
            $('canvasContainer').style.cursor = 'grab';
        }
    }
    
    /**
     * Handle keyboard key up
     * @param {KeyboardEvent} e 
     */
    handleKeyUp(e) {
        if (e.code === 'Space') {
            this.spacePressed = false;
            $('canvasContainer').style.cursor = '';
        }
    }
    
    /**
     * Handle select tool click
     * @param {Object} hitResult 
     * @param {{x: number, y: number}} canvasPos 
     * @param {MouseEvent} e 
     */
    handleSelectToolClick(hitResult, canvasPos, e) {
        if (hitResult.type === 'controlPoint') {
            // Start dragging control point
            this.startDrag('controlPoint', hitResult.edgeId, hitResult.index, canvasPos);
            this.store.setState({ selectedEdge: hitResult.edgeId, selectedWaypoint: null });
        } else if (hitResult.type === 'waypoint') {
            // Select and potentially start dragging waypoint
            this.store.setState({ selectedWaypoint: hitResult.id, selectedEdge: null });
            this.startDrag('waypoint', hitResult.id, null, canvasPos);
        } else if (hitResult.type === 'edge') {
            // Select edge
            this.store.setState({ selectedWaypoint: null, selectedEdge: hitResult.id });
        } else {
            // Click on empty space - deselect
            this.store.setState({ selectedWaypoint: null, selectedEdge: null });
        }
    }
    
    /**
     * Handle waypoint tool click
     * @param {{x: number, y: number}} canvasPos 
     */
    handleWaypointToolClick(canvasPos) {
        const waypoint = createWaypoint({
            x: Math.round(canvasPos.x),
            y: Math.round(canvasPos.y)
        });
        
        this.store.addWaypoint(waypoint);
        this.store.setState({ selectedWaypoint: waypoint.id, selectedEdge: null });
    }
    
    /**
     * Handle edge tool click
     * @param {Object} hitResult 
     * @param {{x: number, y: number}} canvasPos 
     */
    handleEdgeToolClick(hitResult, canvasPos) {
        if (hitResult.type !== 'waypoint') {
            // Clicked on empty space - clear edge creation
            this.clearEdgeCreation();
            return;
        }
        
        if (!this.edgeStartWaypoint) {
            // First click - set start waypoint
            this.edgeStartWaypoint = hitResult.id;
            this.store.setState({ selectedWaypoint: hitResult.id, selectedEdge: null });
        } else {
            // Second click - create edge
            if (hitResult.id !== this.edgeStartWaypoint) {
                const map = this.store.getCurrentMap();
                
                // Check if edge already exists
                if (!edgeExists(map.edges, this.edgeStartWaypoint, hitResult.id)) {
                    const edge = createEdge({
                        from: this.edgeStartWaypoint,
                        to: hitResult.id,
                        cost: 1
                    });
                    this.store.addEdge(edge);
                    this.store.setState({ selectedWaypoint: null, selectedEdge: edge.id });
                }
            }
            
            this.clearEdgeCreation();
        }
    }
    
    /**
     * Clear edge creation state
     */
    clearEdgeCreation() {
        this.edgeStartWaypoint = null;
        this.renderer.clearGhost();
    }
    
    /**
     * Start dragging an element
     * @param {string} type - 'waypoint' or 'controlPoint'
     * @param {string} id 
     * @param {number|null} index - Control point index
     * @param {{x: number, y: number}} canvasPos 
     */
    startDrag(type, id, index, canvasPos) {
        this.isDragging = true;
        this.dragTarget = { type, id, index };
        this.dragStart = { ...canvasPos };
        
        if (type === 'waypoint') {
            const wp = this.store.getWaypoint(id);
            this.originalPosition = wp ? { x: wp.x, y: wp.y } : null;
        } else if (type === 'controlPoint') {
            const edge = this.store.getEdge(id);
            if (edge && edge.controlPoints && edge.controlPoints[index]) {
                this.originalPosition = { ...edge.controlPoints[index] };
            }
        }
    }
    
    /**
     * Handle dragging
     * @param {{x: number, y: number}} canvasPos 
     */
    handleDrag(canvasPos) {
        if (!this.dragTarget || !this.originalPosition) return;
        
        const dx = canvasPos.x - this.dragStart.x;
        const dy = canvasPos.y - this.dragStart.y;
        
        if (this.dragTarget.type === 'waypoint') {
            this.store.updateWaypoint(this.dragTarget.id, {
                x: Math.round(this.originalPosition.x + dx),
                y: Math.round(this.originalPosition.y + dy)
            });
        } else if (this.dragTarget.type === 'controlPoint') {
            const edge = this.store.getEdge(this.dragTarget.id);
            if (edge && edge.controlPoints) {
                const newControlPoints = [...edge.controlPoints];
                newControlPoints[this.dragTarget.index] = {
                    x: this.originalPosition.x + dx,
                    y: this.originalPosition.y + dy
                };
                this.store.updateEdge(this.dragTarget.id, { controlPoints: newControlPoints });
            }
        }
    }
    
    /**
     * End dragging
     */
    endDrag() {
        this.isDragging = false;
        this.dragTarget = null;
        this.originalPosition = null;
    }
    
    /**
     * Hit test to find what's under the cursor
     * @param {number} x 
     * @param {number} y 
     * @param {import('../models/Map.js').MapData} map 
     * @returns {{type: string, id?: string, edgeId?: string, index?: number}}
     */
    hitTest(x, y, map) {
        const state = this.store.getState();
        
        // Check control points first (highest priority when edge is selected)
        if (state.selectedEdge) {
            const edge = map.edges.find(e => e.id === state.selectedEdge);
            if (edge && edge.type === 'bezier' && edge.controlPoints) {
                for (let i = 0; i < edge.controlPoints.length; i++) {
                    const cp = edge.controlPoints[i];
                    if (pointInCircle(x, y, cp.x, cp.y, CONTROL_POINT_HIT_RADIUS)) {
                        return { type: 'controlPoint', edgeId: edge.id, index: i };
                    }
                }
            }
        }
        
        // Check waypoints
        for (const wp of map.waypoints) {
            if (pointInCircle(x, y, wp.x, wp.y, WAYPOINT_HIT_RADIUS)) {
                return { type: 'waypoint', id: wp.id };
            }
        }
        
        // Check edges
        const waypointMap = new Map(map.waypoints.map(wp => [wp.id, wp]));
        for (const edge of map.edges) {
            const fromWp = waypointMap.get(edge.from);
            const toWp = waypointMap.get(edge.to);
            if (!fromWp || !toWp) continue;
            
            let dist;
            if (edge.type === 'bezier' && edge.controlPoints && edge.controlPoints.length >= 2) {
                // For bezier, sample points along the curve
                dist = this.distanceToBezier(x, y, fromWp, toWp, edge.controlPoints);
            } else {
                dist = distanceToLineSegment(x, y, fromWp.x, fromWp.y, toWp.x, toWp.y);
            }
            
            if (dist <= EDGE_HIT_DISTANCE) {
                return { type: 'edge', id: edge.id };
            }
        }
        
        return { type: 'none' };
    }
    
    /**
     * Calculate distance from point to bezier curve
     * @param {number} px 
     * @param {number} py 
     * @param {Object} from 
     * @param {Object} to 
     * @param {Object[]} controlPoints 
     * @returns {number}
     */
    distanceToBezier(px, py, from, to, controlPoints) {
        const [cp1, cp2] = controlPoints;
        let minDist = Infinity;
        
        // Sample 20 points along the curve
        for (let t = 0; t <= 1; t += 0.05) {
            const t2 = t * t;
            const t3 = t2 * t;
            const mt = 1 - t;
            const mt2 = mt * mt;
            const mt3 = mt2 * mt;
            
            // Cubic bezier formula
            const x = mt3 * from.x + 3 * mt2 * t * cp1.x + 3 * mt * t2 * cp2.x + t3 * to.x;
            const y = mt3 * from.y + 3 * mt2 * t * cp1.y + 3 * mt * t2 * cp2.y + t3 * to.y;
            
            const dist = distance(px, py, x, y);
            minDist = Math.min(minDist, dist);
        }
        
        return minDist;
    }
    
    /**
     * Handle cancel action
     */
    handleCancel() {
        this.clearEdgeCreation();
        this.store.setState({ selectedWaypoint: null, selectedEdge: null });
        this.renderer.clearGhost();
    }
    
    /**
     * Handle delete action
     */
    handleDelete() {
        const state = this.store.getState();
        
        if (state.selectedWaypoint) {
            this.store.deleteWaypoint(state.selectedWaypoint);
        } else if (state.selectedEdge) {
            this.store.deleteEdge(state.selectedEdge);
        }
    }
    
    /**
     * Show context menu
     * @param {number} x 
     * @param {number} y 
     * @param {Object} hitResult 
     */
    showContextMenu(x, y, hitResult) {
        const menu = $('contextMenu');
        const renameBtn = menu.querySelector('[data-action="rename"]');
        const deleteBtn = menu.querySelector('[data-action="delete"]');
        const portalBtn = menu.querySelector('[data-action="make-portal"]');
        const bezierBtn = menu.querySelector('[data-action="make-bezier"]');
        
        // Show/hide appropriate options
        if (hitResult.type === 'waypoint') {
            renameBtn.classList.remove('hidden');
            portalBtn.classList.remove('hidden');
            bezierBtn.classList.add('hidden');
        } else if (hitResult.type === 'edge') {
            renameBtn.classList.add('hidden');
            portalBtn.classList.add('hidden');
            
            const edge = this.store.getEdge(hitResult.id);
            if (edge) {
                bezierBtn.textContent = edge.type === 'bezier' ? 'Make Straight' : 'Convert to Curve';
                bezierBtn.classList.remove('hidden');
            }
        }
        
        // Position and show menu
        menu.style.left = `${x}px`;
        menu.style.top = `${y}px`;
        menu.classList.remove('hidden');
        
        // Set up one-time click handlers
        const handleAction = (e) => {
            const action = e.target.dataset.action;
            menu.classList.add('hidden');
            menu.removeEventListener('click', handleAction);
            
            switch (action) {
                case 'rename':
                    this.promptRenameWaypoint(hitResult.id);
                    break;
                case 'delete':
                    this.handleDelete();
                    break;
                case 'make-portal':
                    this.togglePortal(hitResult.id);
                    break;
                case 'make-bezier':
                    const edge = this.store.getEdge(hitResult.id);
                    if (edge) {
                        if (edge.type === 'bezier') {
                            this.convertSelectedToStraight();
                        } else {
                            this.convertSelectedToBezier();
                        }
                    }
                    break;
            }
        };
        
        menu.addEventListener('click', handleAction);
    }
    
    /**
     * Prompt to rename a waypoint
     * @param {string} waypointId 
     */
    promptRenameWaypoint(waypointId) {
        const wp = this.store.getWaypoint(waypointId);
        if (!wp) return;
        
        const newName = prompt('Enter waypoint name:', wp.name || '');
        if (newName !== null) {
            this.store.updateWaypoint(waypointId, { name: newName });
        }
    }
    
    /**
     * Convert selected edge to bezier
     */
    convertSelectedToBezier() {
        const state = this.store.getState();
        if (!state.selectedEdge) return;
        
        const edge = this.store.getEdge(state.selectedEdge);
        if (!edge || edge.type === 'bezier') return;
        
        const fromWp = this.store.getWaypoint(edge.from);
        const toWp = this.store.getWaypoint(edge.to);
        if (!fromWp || !toWp) return;
        
        const bezierEdge = convertToBezier(edge, fromWp, toWp);
        this.store.updateEdge(edge.id, {
            type: bezierEdge.type,
            controlPoints: bezierEdge.controlPoints
        });
    }
    
    /**
     * Convert selected edge to straight
     */
    convertSelectedToStraight() {
        const state = this.store.getState();
        if (!state.selectedEdge) return;
        
        const edge = this.store.getEdge(state.selectedEdge);
        if (!edge || edge.type !== 'bezier') return;
        
        this.store.updateEdge(edge.id, {
            type: 'straight',
            controlPoints: []
        });
    }
    
    /**
     * Toggle portal status for a waypoint
     * @param {string} waypointId 
     */
    togglePortal(waypointId) {
        const wp = this.store.getWaypoint(waypointId);
        if (!wp) return;
        
        this.store.updateWaypoint(waypointId, {
            isPortal: !wp.isPortal,
            portalTargetMapId: wp.isPortal ? null : wp.portalTargetMapId
        });
    }
}
