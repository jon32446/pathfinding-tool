/**
 * Map Pathfinder - Main Application Entry Point
 * 
 * This is the main entry point that initializes all components
 * and wires them together.
 */

import { EventBus } from './core/EventBus.js';
import { StateStore } from './core/StateStore.js';
import { Storage } from './core/Storage.js';
import { MapManager } from './ui/MapManager.js';
import { Toolbar } from './ui/Toolbar.js';
import { CanvasRenderer } from './ui/CanvasRenderer.js';
import { EditorController } from './ui/EditorController.js';
import { ViewerController } from './ui/ViewerController.js';
import { Sidebar } from './ui/Sidebar.js';
import { Pathfinder } from './engine/Pathfinder.js';
import { VERSION, BUILD_DATE } from './version.js';

/**
 * Main Application Class
 * Orchestrates all components and manages global state
 */
class App {
    constructor() {
        // Core infrastructure
        this.eventBus = new EventBus();
        this.store = new StateStore(this.eventBus);
        this.storage = new Storage(this.store);
        
        // Engine
        this.pathfinder = new Pathfinder();
        
        // UI Components (will be initialized after DOM is ready)
        this.toolbar = null;
        this.sidebar = null;
        this.canvasRenderer = null;
        this.editorController = null;
        this.viewerController = null;
        this.mapManager = null;
    }
    
    /**
     * Initialize the application
     */
    async init() {
        console.log('Map Pathfinder initializing...');
        
        // Initialize IndexedDB
        await this.storage.init();
        
        // Initialize UI components
        this.toolbar = new Toolbar(this.eventBus, this.store);
        this.sidebar = new Sidebar(this.eventBus, this.store);
        this.canvasRenderer = new CanvasRenderer(this.eventBus, this.store);
        this.mapManager = new MapManager(this.eventBus, this.store);
        this.editorController = new EditorController(
            this.eventBus, 
            this.store, 
            this.canvasRenderer
        );
        this.viewerController = new ViewerController(
            this.eventBus, 
            this.store, 
            this.canvasRenderer,
            this.pathfinder
        );
        
        // Set up global event listeners
        this.setupEventListeners();
        
        // Load saved data from storage (migrates from localStorage if needed)
        await this.storage.load();
        
        // Initialize all UI components
        this.toolbar.init();
        this.sidebar.init();
        this.canvasRenderer.init();
        this.editorController.init();
        this.viewerController.init();
        this.mapManager.init();
        
        // Set up auto-save
        this.storage.enableAutoSave();
        
        // Initialize edit mode (activate directly since state already says 'edit')
        this.editorController.activate();
        
        // Display version
        this.displayVersion();
        
        console.log('Map Pathfinder ready!');
    }
    
    /**
     * Display version information in status bar
     */
    displayVersion() {
        const versionEl = document.getElementById('statusVersion');
        if (versionEl) {
            versionEl.textContent = VERSION;
            versionEl.title = `Version: ${VERSION} | Built: ${BUILD_DATE}`;
        }
    }
    
    /**
     * Set up global event listeners
     */
    setupEventListeners() {
        // Mode changes
        this.eventBus.on('mode:change', (mode) => {
            this.handleModeChange(mode);
        });
        
        // Map selection
        this.eventBus.on('map:select', (mapId) => {
            this.handleMapSelect(mapId);
        });
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            this.handleKeydown(e);
        });
        
        // Prevent context menu on canvas
        document.getElementById('canvasContainer').addEventListener('contextmenu', (e) => {
            e.preventDefault();
        });
        
        // Close context menu on click outside
        document.addEventListener('click', (e) => {
            const contextMenu = document.getElementById('contextMenu');
            if (!contextMenu.contains(e.target)) {
                contextMenu.classList.add('hidden');
            }
        });
        
        // Window resize
        window.addEventListener('resize', () => {
            this.eventBus.emit('window:resize');
        });
    }
    
    /**
     * Handle mode changes (edit/view)
     */
    handleModeChange(mode) {
        const state = this.store.getState();
        if (state.mode === mode) return;
        
        this.store.setState({ mode });
        
        // Update UI visibility
        const canvasTools = document.getElementById('canvasTools');
        const viewControls = document.getElementById('viewControls');
        const statusMode = document.getElementById('statusMode');
        
        if (mode === 'edit') {
            canvasTools.classList.remove('hidden');
            viewControls.classList.add('hidden');
            statusMode.textContent = 'Edit Mode';
            this.editorController.activate();
            this.viewerController.deactivate();
        } else {
            canvasTools.classList.add('hidden');
            viewControls.classList.remove('hidden');
            statusMode.textContent = 'View Mode';
            this.editorController.deactivate();
            this.viewerController.activate();
        }
        
        // Clear any selection when switching modes
        this.store.setState({ 
            selectedWaypoint: null, 
            selectedEdge: null 
        });
    }
    
    /**
     * Handle map selection
     */
    handleMapSelect(mapId) {
        const state = this.store.getState();
        if (state.currentMapId === mapId) return;
        
        // Clear undo history when switching maps
        this.store.clearHistory();
        
        this.store.setState({ 
            currentMapId: mapId,
            selectedWaypoint: null,
            selectedEdge: null,
            routeStart: null,
            routeEnd: null,
            currentRoute: null,
            alternativeRoute: null
        });
        
        this.canvasRenderer.loadMap(mapId);
        this.sidebar.updateProperties(null);
    }
    
    /**
     * Handle keyboard shortcuts
     */
    handleKeydown(e) {
        const state = this.store.getState();
        
        // Don't trigger shortcuts when typing in inputs
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
            return;
        }
        
        // Mode-independent shortcuts
        switch (e.key) {
            case 'Escape':
                this.eventBus.emit('action:cancel');
                document.getElementById('contextMenu').classList.add('hidden');
                break;
            case 'Delete':
            case 'Backspace':
                if (state.mode === 'edit') {
                    this.eventBus.emit('action:delete');
                }
                break;
        }
        
        // Edit mode shortcuts
        if (state.mode === 'edit') {
            switch (e.key.toLowerCase()) {
                case 'v':
                    this.eventBus.emit('tool:select', 'select');
                    break;
                case 'w':
                    this.eventBus.emit('tool:select', 'waypoint');
                    break;
                case 'e':
                    this.eventBus.emit('tool:select', 'edge');
                    break;
                case 't':
                    this.eventBus.emit('tool:select', 'paint');
                    break;
            }
        }
        
        // Undo/Redo shortcuts (Ctrl+Z, Ctrl+Shift+Z, Ctrl+Y)
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
            e.preventDefault();
            if (e.shiftKey) {
                this.store.redo();
            } else {
                this.store.undo();
            }
        }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
            e.preventDefault();
            this.store.redo();
        }
        
        // Zoom shortcuts
        if (e.ctrlKey || e.metaKey) {
            switch (e.key) {
                case '=':
                case '+':
                    e.preventDefault();
                    this.eventBus.emit('zoom:in');
                    break;
                case '-':
                    e.preventDefault();
                    this.eventBus.emit('zoom:out');
                    break;
                case '0':
                    e.preventDefault();
                    this.eventBus.emit('zoom:reset');
                    break;
            }
        }
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.app = new App();
    window.app.init().catch(console.error);
});
