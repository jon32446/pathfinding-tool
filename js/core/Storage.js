/**
 * Storage - IndexedDB persistence and JSON export/import
 * 
 * Handles saving/loading map data to IndexedDB and
 * exporting/importing as JSON files.
 */

const DB_NAME = 'mapPathfinder';
const DB_VERSION = 1;
const STORE_NAME = 'appData';
const DATA_KEY = 'mainData';
const AUTO_SAVE_DELAY = 1000; // 1 second debounce

// Legacy localStorage key for migration
const LEGACY_STORAGE_KEY = 'mapPathfinder_data';

export class Storage {
    /**
     * @param {import('./StateStore.js').StateStore} store 
     */
    constructor(store) {
        this.store = store;
        this.db = null;
        this.autoSaveTimeout = null;
        this.autoSaveEnabled = false;
        this.saveErrorShown = false; // Only show modal once per session
    }
    
    /**
     * Initialize IndexedDB connection
     * @returns {Promise<boolean>}
     */
    async init() {
        return new Promise((resolve) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            
            request.onerror = (event) => {
                console.error('Failed to open IndexedDB:', event.target.error);
                resolve(false);
            };
            
            request.onsuccess = (event) => {
                this.db = event.target.result;
                console.log('IndexedDB opened successfully');
                resolve(true);
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                
                // Create object store if it doesn't exist
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME);
                    console.log('Created IndexedDB object store');
                }
            };
        });
    }
    
    /**
     * Load data from IndexedDB (with localStorage migration)
     * @returns {Promise<boolean>}
     */
    async load() {
        // First, check for legacy localStorage data to migrate
        const migrated = await this.migrateLegacyData();
        if (migrated) {
            return true;
        }
        
        // Load from IndexedDB
        if (!this.db) {
            console.error('IndexedDB not initialized');
            return false;
        }
        
        return new Promise((resolve) => {
            const transaction = this.db.transaction(STORE_NAME, 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.get(DATA_KEY);
            
            request.onsuccess = (event) => {
                const data = event.target.result;
                if (data) {
                    this.store.loadFromData(data);
                    this.updateStorageUsage();
                    console.log('Loaded data from IndexedDB');
                    resolve(true);
                } else {
                    resolve(false);
                }
            };
            
            request.onerror = (event) => {
                console.error('Failed to load from IndexedDB:', event.target.error);
                resolve(false);
            };
        });
    }
    
    /**
     * Migrate data from legacy localStorage to IndexedDB
     * @returns {Promise<boolean>} True if migration occurred
     */
    async migrateLegacyData() {
        try {
            const legacyData = localStorage.getItem(LEGACY_STORAGE_KEY);
            if (!legacyData) {
                return false;
            }
            
            console.log('Found legacy localStorage data, migrating to IndexedDB...');
            const parsed = JSON.parse(legacyData);
            this.store.loadFromData(parsed);
            
            // Save to IndexedDB
            const saved = await this.save();
            
            if (saved) {
                // Remove legacy data
                localStorage.removeItem(LEGACY_STORAGE_KEY);
                console.log('Migration complete, legacy data removed');
                return true;
            }
        } catch (error) {
            console.error('Migration failed:', error);
        }
        return false;
    }
    
    /**
     * Save data to IndexedDB
     * @returns {Promise<boolean>}
     */
    async save() {
        if (!this.db) {
            console.error('IndexedDB not initialized');
            this.updateSaveStatus(false);
            return false;
        }
        
        return new Promise((resolve) => {
            try {
                const data = this.store.getSerializableData();
                const transaction = this.db.transaction(STORE_NAME, 'readwrite');
                const store = transaction.objectStore(STORE_NAME);
                const request = store.put(data, DATA_KEY);
                
                request.onsuccess = () => {
                    this.updateSaveStatus(true);
                    this.updateStorageUsage();
                    console.log('Saved to IndexedDB');
                    resolve(true);
                };
                
                request.onerror = (event) => {
                    console.error('Failed to save to IndexedDB:', event.target.error);
                    this.updateSaveStatus(false);
                    this.handleSaveError();
                    resolve(false);
                };
                
                transaction.onerror = (event) => {
                    console.error('Transaction failed:', event.target.error);
                    this.updateSaveStatus(false);
                    this.handleSaveError();
                    resolve(false);
                };
            } catch (error) {
                console.error('Failed to save:', error);
                this.updateSaveStatus(false);
                this.handleSaveError();
                resolve(false);
            }
        });
    }
    
    /**
     * Handle save error - show modal once per session
     */
    handleSaveError() {
        if (this.saveErrorShown) return;
        this.saveErrorShown = true;
        
        this.showSaveErrorModal();
    }
    
    /**
     * Show the save error modal
     */
    showSaveErrorModal() {
        // Create modal if it doesn't exist
        let modal = document.getElementById('saveErrorModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'saveErrorModal';
            modal.className = 'modal';
            modal.innerHTML = `
                <div class="modal-backdrop"></div>
                <div class="modal-content modal-small">
                    <div class="modal-header">
                        <h2>Save Failed</h2>
                        <button class="modal-close" id="saveErrorModalClose">&times;</button>
                    </div>
                    <div class="modal-body">
                        <p><strong>Your map data could not be saved to the browser.</strong></p>
                        <p>This might be due to browser storage restrictions, private browsing mode, or a browser issue.</p>
                        <p><strong>To avoid losing your work:</strong></p>
                        <ul style="margin: 10px 0; padding-left: 20px; color: var(--color-text-secondary);">
                            <li>Export your data to a JSON file</li>
                            <li>Try using a different browser</li>
                            <li>Check if you're in private/incognito mode</li>
                        </ul>
                        <p style="color: var(--color-warning);">⚠️ Your changes are NOT being saved automatically. Please export to avoid data loss.</p>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary" id="saveErrorModalDismiss">Dismiss</button>
                        <button class="btn btn-primary" id="saveErrorModalExport">Export Now</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
            
            // Set up event listeners
            document.getElementById('saveErrorModalClose').addEventListener('click', () => {
                modal.classList.add('hidden');
            });
            document.getElementById('saveErrorModalDismiss').addEventListener('click', () => {
                modal.classList.add('hidden');
            });
            document.getElementById('saveErrorModalExport').addEventListener('click', () => {
                this.exportToFile();
                modal.classList.add('hidden');
            });
            modal.querySelector('.modal-backdrop').addEventListener('click', () => {
                modal.classList.add('hidden');
            });
        }
        
        modal.classList.remove('hidden');
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
            
            await this.save(); // Persist imported data
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
    async clear() {
        if (!this.db) {
            console.error('IndexedDB not initialized');
            return false;
        }
        
        return new Promise((resolve) => {
            const transaction = this.db.transaction(STORE_NAME, 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.delete(DATA_KEY);
            
            request.onsuccess = () => {
                this.store.reset();
                console.log('Cleared all data');
                resolve(true);
            };
            
            request.onerror = (event) => {
                console.error('Failed to clear data:', event.target.error);
                resolve(false);
            };
        });
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
     * Update storage usage display
     */
    updateStorageUsage() {
        const statusStorage = document.getElementById('statusStorage');
        if (!statusStorage) return;
        
        try {
            const data = this.store.getSerializableData();
            const bytes = new Blob([JSON.stringify(data)]).size;
            
            const kb = bytes / 1024;
            const mb = kb / 1024;
            
            let text;
            if (mb >= 1) {
                text = `${mb.toFixed(1)} MB`;
            } else {
                text = `${Math.round(kb)} KB`;
            }
            
            statusStorage.textContent = text;
            statusStorage.title = `Data size: ${text}`;
        } catch (e) {
            statusStorage.textContent = '--';
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
