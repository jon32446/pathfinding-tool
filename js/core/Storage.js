/**
 * Storage - LocalStorage persistence and JSON export/import
 * 
 * Handles saving/loading map data to LocalStorage and
 * exporting/importing as JSON files.
 */

const STORAGE_KEY = 'mapPathfinder_data';
const AUTO_SAVE_DELAY = 1000; // 1 second debounce

export class Storage {
    /**
     * @param {import('./StateStore.js').StateStore} store 
     */
    constructor(store) {
        this.store = store;
        this.autoSaveTimeout = null;
        this.autoSaveEnabled = false;
    }
    
    /**
     * Load data from LocalStorage
     */
    async load() {
        try {
            const data = localStorage.getItem(STORAGE_KEY);
            if (data) {
                const parsed = JSON.parse(data);
                this.store.loadFromData(parsed);
                console.log('Loaded data from LocalStorage');
                return true;
            }
        } catch (error) {
            console.error('Failed to load from LocalStorage:', error);
        }
        return false;
    }
    
    /**
     * Save data to LocalStorage
     */
    save() {
        try {
            const data = this.store.getSerializableData();
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
            this.updateSaveStatus(true);
            console.log('Saved to LocalStorage');
            return true;
        } catch (error) {
            console.error('Failed to save to LocalStorage:', error);
            this.updateSaveStatus(false);
            return false;
        }
    }
    
    /**
     * Enable auto-save on state changes
     */
    enableAutoSave() {
        this.autoSaveEnabled = true;
        this.store.eventBus.on('state:change', ({ changedKeys }) => {
            // Only auto-save on map data changes
            if (changedKeys.includes('maps')) {
                this.debouncedSave();
            }
        });
    }
    
    /**
     * Disable auto-save
     */
    disableAutoSave() {
        this.autoSaveEnabled = false;
        if (this.autoSaveTimeout) {
            clearTimeout(this.autoSaveTimeout);
            this.autoSaveTimeout = null;
        }
    }
    
    /**
     * Debounced save to prevent too frequent writes
     */
    debouncedSave() {
        if (!this.autoSaveEnabled) return;
        
        this.updateSaveStatus(false, true); // Mark as "saving..."
        
        if (this.autoSaveTimeout) {
            clearTimeout(this.autoSaveTimeout);
        }
        
        this.autoSaveTimeout = setTimeout(() => {
            this.save();
        }, AUTO_SAVE_DELAY);
    }
    
    /**
     * Export all maps as a JSON file download
     */
    exportToFile() {
        try {
            const data = this.store.getSerializableData();
            const json = JSON.stringify(data, null, 2);
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            
            const a = document.createElement('a');
            a.href = url;
            a.download = `map-pathfinder-export-${this.getTimestamp()}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            console.log('Exported to file');
            return true;
        } catch (error) {
            console.error('Failed to export:', error);
            return false;
        }
    }
    
    /**
     * Import maps from a JSON file
     * @param {File} file 
     * @param {boolean} merge - If true, merge with existing maps; if false, replace
     * @returns {Promise<boolean>}
     */
    async importFromFile(file, merge = false) {
        try {
            const text = await file.text();
            const data = JSON.parse(text);
            
            if (!data.maps || typeof data.maps !== 'object') {
                throw new Error('Invalid file format: missing maps object');
            }
            
            if (merge) {
                // Merge with existing maps
                const currentData = this.store.getSerializableData();
                const mergedMaps = { ...currentData.maps, ...data.maps };
                this.store.loadFromData({ maps: mergedMaps });
            } else {
                // Replace all maps
                this.store.loadFromData(data);
            }
            
            this.save(); // Persist imported data
            console.log('Imported from file');
            return true;
        } catch (error) {
            console.error('Failed to import:', error);
            alert(`Failed to import: ${error.message}`);
            return false;
        }
    }
    
    /**
     * Clear all saved data
     */
    clear() {
        try {
            localStorage.removeItem(STORAGE_KEY);
            this.store.reset();
            console.log('Cleared all data');
            return true;
        } catch (error) {
            console.error('Failed to clear data:', error);
            return false;
        }
    }
    
    /**
     * Update the save status indicator in the UI
     * @param {boolean} saved 
     * @param {boolean} saving 
     */
    updateSaveStatus(saved, saving = false) {
        const statusSaved = document.getElementById('statusSaved');
        if (!statusSaved) return;
        
        if (saving) {
            statusSaved.innerHTML = `
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
                </svg>
                Saving...
            `;
            statusSaved.style.color = 'var(--color-warning)';
        } else if (saved) {
            statusSaved.innerHTML = `
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                    <polyline points="17 21 17 13 7 13 7 21"/>
                    <polyline points="7 3 7 8 15 8"/>
                </svg>
                Saved
            `;
            statusSaved.style.color = '';
        } else {
            statusSaved.innerHTML = `
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="12" y1="8" x2="12" y2="12"/>
                    <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                Unsaved
            `;
            statusSaved.style.color = 'var(--color-danger)';
        }
    }
    
    /**
     * Get a timestamp string for filenames
     * @returns {string}
     */
    getTimestamp() {
        const now = new Date();
        return now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
    }
}
