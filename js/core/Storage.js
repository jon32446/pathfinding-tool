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
        this.quotaWarningShown = false; // Only show modal once per session
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
                this.updateStorageUsage(data.length);
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
            const json = JSON.stringify(data);
            localStorage.setItem(STORAGE_KEY, json);
            this.updateSaveStatus(true);
            this.updateStorageUsage(json.length);
            console.log('Saved to LocalStorage');
            return true;
        } catch (error) {
            console.error('Failed to save to LocalStorage:', error);
            this.updateSaveStatus(false);
            
            // Check if it's a quota error
            if (this.isQuotaError(error)) {
                this.handleQuotaExceeded();
            }
            
            return false;
        }
    }
    
    /**
     * Check if an error is a storage quota error
     * @param {Error} error 
     * @returns {boolean}
     */
    isQuotaError(error) {
        return (
            error.name === 'QuotaExceededError' ||
            error.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
            (error.code && error.code === 22) || // Legacy Chrome
            error.message?.includes('quota')
        );
    }
    
    /**
     * Handle quota exceeded - show modal once per session
     */
    handleQuotaExceeded() {
        if (this.quotaWarningShown) return;
        this.quotaWarningShown = true;
        
        const dataSize = this.getDataSize();
        const dataSizeMB = (dataSize / (1024 * 1024)).toFixed(2);
        
        this.showQuotaModal(dataSizeMB);
    }
    
    /**
     * Show the storage quota exceeded modal
     * @param {string} dataSizeMB 
     */
    showQuotaModal(dataSizeMB) {
        // Create modal if it doesn't exist
        let modal = document.getElementById('quotaModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'quotaModal';
            modal.className = 'modal';
            modal.innerHTML = `
                <div class="modal-backdrop"></div>
                <div class="modal-content modal-small">
                    <div class="modal-header">
                        <h2>Storage Limit Reached</h2>
                        <button class="modal-close" id="quotaModalClose">&times;</button>
                    </div>
                    <div class="modal-body">
                        <p><strong>Your map data (${dataSizeMB} MB) exceeds the browser's storage limit.</strong></p>
                        <p>Browser localStorage is limited to ~5-10 MB. Your maps contain large images which take up significant space.</p>
                        <p><strong>What you can do:</strong></p>
                        <ul style="margin: 10px 0; padding-left: 20px; color: var(--color-text-secondary);">
                            <li>Export your data to a JSON file (this always works)</li>
                            <li>Delete unused maps to free up space</li>
                            <li>Use smaller/compressed images when creating maps</li>
                        </ul>
                        <p style="color: var(--color-warning);">⚠️ Your changes are NOT being saved automatically. Please export to avoid data loss.</p>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary" id="quotaModalDismiss">Dismiss</button>
                        <button class="btn btn-primary" id="quotaModalExport">Export Now</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
            
            // Set up event listeners
            document.getElementById('quotaModalClose').addEventListener('click', () => {
                modal.classList.add('hidden');
            });
            document.getElementById('quotaModalDismiss').addEventListener('click', () => {
                modal.classList.add('hidden');
            });
            document.getElementById('quotaModalExport').addEventListener('click', () => {
                this.exportToFile();
                modal.classList.add('hidden');
            });
            modal.querySelector('.modal-backdrop').addEventListener('click', () => {
                modal.classList.add('hidden');
            });
        } else {
            // Update the size in existing modal
            modal.querySelector('.modal-body p strong').textContent = 
                `Your map data (${dataSizeMB} MB) exceeds the browser's storage limit.`;
        }
        
        modal.classList.remove('hidden');
    }
    
    /**
     * Get the current data size in bytes
     * @returns {number}
     */
    getDataSize() {
        try {
            const data = this.store.getSerializableData();
            return new Blob([JSON.stringify(data)]).size;
        } catch (e) {
            return 0;
        }
    }
    
    /**
     * Update storage usage display
     * @param {number} bytes 
     */
    updateStorageUsage(bytes) {
        const statusStorage = document.getElementById('statusStorage');
        if (!statusStorage) return;
        
        const kb = bytes / 1024;
        const mb = kb / 1024;
        
        let text, color;
        if (mb >= 4) {
            text = `${mb.toFixed(1)} MB`;
            color = 'var(--color-danger)';
        } else if (mb >= 2) {
            text = `${mb.toFixed(1)} MB`;
            color = 'var(--color-warning)';
        } else if (kb >= 100) {
            text = `${mb.toFixed(1)} MB`;
            color = '';
        } else {
            text = `${Math.round(kb)} KB`;
            color = '';
        }
        
        statusStorage.textContent = text;
        statusStorage.style.color = color;
        statusStorage.title = `Data size: ${text}. Browser limit is typically 5-10 MB.`;
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
