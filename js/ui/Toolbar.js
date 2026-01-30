/**
 * Toolbar - Handles top toolbar interactions
 */

import { $ } from '../utils/dom.js';

export class Toolbar {
    /**
     * @param {import('../core/EventBus.js').EventBus} eventBus 
     * @param {import('../core/StateStore.js').StateStore} store 
     */
    constructor(eventBus, store) {
        this.eventBus = eventBus;
        this.store = store;
    }
    
    /**
     * Initialize the toolbar
     */
    init() {
        this.setupModeToggle();
        this.setupMenuButtons();
    }
    
    /**
     * Set up edit/view mode toggle
     */
    setupModeToggle() {
        const modeButtons = document.querySelectorAll('.mode-btn[data-mode]');
        
        modeButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const mode = btn.dataset.mode;
                this.eventBus.emit('mode:change', mode);
                
                // Update active state
                modeButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });
    }
    
    /**
     * Set up menu buttons (import/export)
     */
    setupMenuButtons() {
        // Import button
        $('importBtn').addEventListener('click', () => {
            $('importFileInput').click();
        });
        
        $('importFileInput').addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                this.eventBus.emit('file:import', file);
                e.target.value = ''; // Reset for same file selection
            }
        });
        
        // Export button
        $('exportBtn').addEventListener('click', () => {
            this.eventBus.emit('file:export');
        });
        
        // Menu button (placeholder for future options)
        $('menuBtn').addEventListener('click', () => {
            // Could open a dropdown menu with more options
            console.log('Menu clicked');
        });
    }
}
