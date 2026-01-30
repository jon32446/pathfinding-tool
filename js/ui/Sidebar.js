/**
 * Sidebar - Handles map tree and properties panel
 */

import { $, clearElement, createElement, show, hide } from '../utils/dom.js';
import { getMapTree } from '../models/Map.js';

export class Sidebar {
    /**
     * @param {import('../core/EventBus.js').EventBus} eventBus 
     * @param {import('../core/StateStore.js').StateStore} store 
     */
    constructor(eventBus, store) {
        this.eventBus = eventBus;
        this.store = store;
    }
    
    /**
     * Initialize the sidebar
     */
    init() {
        this.setupEventListeners();
        this.renderMapTree();
    }
    
    /**
     * Set up event listeners
     */
    setupEventListeners() {
        this.eventBus.on('maps:updated', () => this.renderMapTree());
        this.eventBus.on('map:changed', () => this.updateActiveMap());
        this.eventBus.on('selection:changed', ({ waypoint, edge }) => {
            if (waypoint) {
                this.showWaypointProperties(waypoint);
            } else if (edge) {
                this.showEdgeProperties(edge);
            } else {
                this.showEmptyProperties();
            }
        });
        
        // Waypoint/edge updates
        this.eventBus.on('waypoint:updated', () => {
            const state = this.store.getState();
            if (state.selectedWaypoint) {
                this.showWaypointProperties(state.selectedWaypoint);
            }
        });
        
        this.eventBus.on('edge:updated', () => {
            const state = this.store.getState();
            if (state.selectedEdge) {
                this.showEdgeProperties(state.selectedEdge);
            }
        });
    }
    
    /**
     * Render the map tree
     */
    renderMapTree() {
        const mapTree = $('mapTree');
        const state = this.store.getState();
        const maps = state.maps;
        
        if (Object.keys(maps).length === 0) {
            mapTree.innerHTML = `
                <div class="empty-state">
                    <p>No maps yet</p>
                    <button class="btn btn-primary" id="createFirstMapBtn">Create Map</button>
                </div>
            `;
            $('createFirstMapBtn').addEventListener('click', () => {
                this.eventBus.emit('map:create');
            });
            return;
        }
        
        clearElement(mapTree);
        const tree = getMapTree(maps);
        this.renderTreeNodes(mapTree, tree, 0);
    }
    
    /**
     * Render tree nodes recursively
     * @param {Element} container 
     * @param {Array} nodes 
     * @param {number} depth 
     */
    renderTreeNodes(container, nodes, depth) {
        const state = this.store.getState();
        
        nodes.forEach(node => {
            const item = createElement('button', {
                className: `map-tree-item ${node.id === state.currentMapId ? 'active' : ''}`,
                style: { paddingLeft: `${10 + depth * 16}px` },
                'data-map-id': node.id
            });
            
            // Icon
            const icon = createElement('span', { className: 'map-tree-icon' });
            icon.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                    <circle cx="8.5" cy="8.5" r="1.5"/>
                    <polyline points="21 15 16 10 5 21"/>
                </svg>
            `;
            item.appendChild(icon);
            
            // Name
            const name = createElement('span', { className: 'map-tree-name' }, [node.name]);
            item.appendChild(name);
            
            // Portal badge if has children
            if (node.children && node.children.length > 0) {
                const badge = createElement('span', { className: 'map-tree-badge' }, [
                    `${node.children.length}`
                ]);
                item.appendChild(badge);
            }
            
            // Click handler
            item.addEventListener('click', () => {
                this.eventBus.emit('map:select', node.id);
            });
            
            // Right-click for context menu
            item.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                this.showMapContextMenu(e.clientX, e.clientY, node.id);
            });
            
            container.appendChild(item);
            
            // Render children
            if (node.children && node.children.length > 0) {
                this.renderTreeNodes(container, node.children, depth + 1);
            }
        });
    }
    
    /**
     * Update active map highlighting
     */
    updateActiveMap() {
        const state = this.store.getState();
        document.querySelectorAll('.map-tree-item').forEach(item => {
            item.classList.toggle('active', item.dataset.mapId === state.currentMapId);
        });
    }
    
    /**
     * Show waypoint properties in the panel
     * @param {string} waypointId 
     */
    showWaypointProperties(waypointId) {
        const wp = this.store.getWaypoint(waypointId);
        if (!wp) {
            this.showEmptyProperties();
            return;
        }
        
        const panel = $('propertiesPanel');
        panel.innerHTML = `
            <div class="property-group">
                <div class="property-group-title">
                    <span class="color-indicator waypoint"></span>
                    Waypoint
                </div>
                <div class="property-row">
                    <label class="property-label">Name</label>
                    <div class="property-value">
                        <input type="text" id="propWaypointName" value="${wp.name || ''}" placeholder="Unnamed">
                    </div>
                </div>
                <div class="property-row">
                    <label class="property-label">Position</label>
                    <div class="property-value property-value-text">${Math.round(wp.x)}, ${Math.round(wp.y)}</div>
                </div>
                <div class="property-row">
                    <label class="property-label">Portal</label>
                    <div class="property-value">
                        <input type="checkbox" id="propWaypointPortal" ${wp.isPortal ? 'checked' : ''}>
                    </div>
                </div>
                ${wp.isPortal ? `
                <div class="property-row">
                    <label class="property-label">Target</label>
                    <div class="property-value">
                        <select id="propPortalTarget">
                            <option value="">Select map...</option>
                            ${this.getMapOptions(wp.portalTargetMapId)}
                        </select>
                    </div>
                </div>
                ` : ''}
            </div>
            <div class="property-actions">
                <button class="btn btn-secondary" id="propDeleteWaypoint">Delete</button>
            </div>
        `;
        
        // Set up event listeners
        $('propWaypointName').addEventListener('change', (e) => {
            this.store.updateWaypoint(waypointId, { name: e.target.value });
        });
        
        $('propWaypointPortal').addEventListener('change', (e) => {
            this.store.updateWaypoint(waypointId, { isPortal: e.target.checked });
            this.showWaypointProperties(waypointId); // Re-render to show/hide target
        });
        
        if (wp.isPortal) {
            $('propPortalTarget').addEventListener('change', (e) => {
                this.store.updateWaypoint(waypointId, { portalTargetMapId: e.target.value || null });
            });
        }
        
        $('propDeleteWaypoint').addEventListener('click', () => {
            this.store.deleteWaypoint(waypointId);
        });
    }
    
    /**
     * Show edge properties in the panel
     * @param {string} edgeId 
     */
    showEdgeProperties(edgeId) {
        const edge = this.store.getEdge(edgeId);
        if (!edge) {
            this.showEmptyProperties();
            return;
        }
        
        const fromWp = this.store.getWaypoint(edge.from);
        const toWp = this.store.getWaypoint(edge.to);
        
        const panel = $('propertiesPanel');
        panel.innerHTML = `
            <div class="property-group">
                <div class="property-group-title">
                    <span class="color-indicator edge"></span>
                    Edge
                </div>
                <div class="property-row">
                    <label class="property-label">From</label>
                    <div class="property-value property-value-text">${fromWp?.name || 'Waypoint'}</div>
                </div>
                <div class="property-row">
                    <label class="property-label">To</label>
                    <div class="property-value property-value-text">${toWp?.name || 'Waypoint'}</div>
                </div>
                <div class="property-row">
                    <label class="property-label">Cost</label>
                    <div class="property-value">
                        <input type="number" id="propEdgeCost" value="${edge.cost}" min="0" step="0.1">
                    </div>
                </div>
                <div class="property-row">
                    <label class="property-label">Type</label>
                    <div class="property-value property-value-text">${edge.type === 'bezier' ? 'Curved' : 'Straight'}</div>
                </div>
                <div class="property-row">
                    <label class="property-label">Two-way</label>
                    <div class="property-value">
                        <input type="checkbox" id="propEdgeBidirectional" ${edge.bidirectional !== false ? 'checked' : ''}>
                    </div>
                </div>
            </div>
            <div class="property-actions">
                <button class="btn btn-secondary" id="propToggleBezier">
                    ${edge.type === 'bezier' ? 'Make Straight' : 'Make Curved'}
                </button>
                <button class="btn btn-secondary" id="propDeleteEdge">Delete</button>
            </div>
        `;
        
        // Set up event listeners
        $('propEdgeCost').addEventListener('change', (e) => {
            const cost = parseFloat(e.target.value);
            if (!isNaN(cost) && cost >= 0) {
                this.store.updateEdge(edgeId, { cost });
            }
        });
        
        $('propEdgeBidirectional').addEventListener('change', (e) => {
            this.store.updateEdge(edgeId, { bidirectional: e.target.checked });
        });
        
        $('propToggleBezier').addEventListener('click', () => {
            if (edge.type === 'bezier') {
                this.eventBus.emit('action:make-straight');
            } else {
                this.eventBus.emit('action:make-bezier');
            }
        });
        
        $('propDeleteEdge').addEventListener('click', () => {
            this.store.deleteEdge(edgeId);
        });
    }
    
    /**
     * Show empty properties state
     */
    showEmptyProperties() {
        const panel = $('propertiesPanel');
        panel.innerHTML = `
            <div class="empty-state">
                <p>Select an item to view properties</p>
            </div>
        `;
    }
    
    /**
     * Update properties panel for current selection
     * @param {Object|null} selection 
     */
    updateProperties(selection) {
        if (!selection) {
            this.showEmptyProperties();
        }
    }
    
    /**
     * Get map options for select dropdown
     * @param {string|null} selectedId 
     * @returns {string}
     */
    getMapOptions(selectedId) {
        const state = this.store.getState();
        const currentMapId = state.currentMapId;
        
        return Object.values(state.maps)
            .filter(m => m.id !== currentMapId) // Can't link to self
            .map(m => `<option value="${m.id}" ${m.id === selectedId ? 'selected' : ''}>${m.name}</option>`)
            .join('');
    }
    
    /**
     * Show context menu for a map
     * @param {number} x 
     * @param {number} y 
     * @param {string} mapId 
     */
    showMapContextMenu(x, y, mapId) {
        const menu = $('contextMenu');
        
        // Update menu options for map
        menu.innerHTML = `
            <button class="context-menu-item" data-action="rename">Rename</button>
            <button class="context-menu-item" data-action="delete">Delete</button>
        `;
        
        menu.style.left = `${x}px`;
        menu.style.top = `${y}px`;
        menu.classList.remove('hidden');
        
        const handleAction = (e) => {
            const action = e.target.dataset.action;
            menu.classList.add('hidden');
            menu.removeEventListener('click', handleAction);
            
            switch (action) {
                case 'rename':
                    const map = this.store.getMap(mapId);
                    if (map) {
                        const newName = prompt('Enter map name:', map.name);
                        if (newName) {
                            this.store.setMap({ ...map, name: newName });
                        }
                    }
                    break;
                case 'delete':
                    if (confirm('Delete this map? This cannot be undone.')) {
                        this.store.deleteMap(mapId);
                    }
                    break;
            }
        };
        
        menu.addEventListener('click', handleAction);
    }
}
