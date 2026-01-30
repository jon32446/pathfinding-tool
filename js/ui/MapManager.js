/**
 * MapManager - Handles map creation, image upload, and map management
 */

import { $, readFileAsDataURL, loadImage, hide, show } from '../utils/dom.js';
import { createMap } from '../models/Map.js';

export class MapManager {
    /**
     * @param {import('../core/EventBus.js').EventBus} eventBus 
     * @param {import('../core/StateStore.js').StateStore} store 
     */
    constructor(eventBus, store) {
        this.eventBus = eventBus;
        this.store = store;
        
        // Pending image for map creation
        this.pendingImageData = null;
        this.pendingImageWidth = 0;
        this.pendingImageHeight = 0;
        
        // Pending import data
        this.pendingImportData = null;
    }
    
    /**
     * Initialize the map manager
     */
    init() {
        this.setupEventListeners();
        this.setupModal();
    }
    
    /**
     * Set up event listeners
     */
    setupEventListeners() {
        // Map creation buttons
        $('addMapBtn').addEventListener('click', () => this.openCreateModal());
        $('uploadMapBtn').addEventListener('click', () => this.openCreateModal());
        
        // File import/export
        this.eventBus.on('file:import', (file) => this.handleImport(file));
        this.eventBus.on('file:export', () => this.handleExport());
        
        // Map creation event
        this.eventBus.on('map:create', () => this.openCreateModal());
        
        // Import modal buttons
        this.setupImportModal();
    }
    
    /**
     * Set up import confirmation modal
     */
    setupImportModal() {
        const modal = $('importModal');
        const backdrop = modal.querySelector('.modal-backdrop');
        const closeBtn = $('importModalClose');
        const cancelBtn = $('importCancelBtn');
        const mergeBtn = $('importMergeBtn');
        const replaceBtn = $('importReplaceBtn');
        
        const closeModal = () => {
            hide(modal);
            this.pendingImportData = null;
        };
        
        backdrop.addEventListener('click', closeModal);
        closeBtn.addEventListener('click', closeModal);
        cancelBtn.addEventListener('click', closeModal);
        
        mergeBtn.addEventListener('click', () => {
            this.executeImport(true);
            closeModal();
        });
        
        replaceBtn.addEventListener('click', () => {
            this.executeImport(false);
            closeModal();
        });
    }
    
    /**
     * Set up the map creation modal
     */
    setupModal() {
        const modal = $('mapModal');
        const backdrop = modal.querySelector('.modal-backdrop');
        const closeBtn = $('mapModalClose');
        const cancelBtn = $('mapModalCancel');
        const saveBtn = $('mapModalSave');
        const uploadArea = $('imageUploadArea');
        const imageInput = $('modalImageInput');
        const previewArea = $('imagePreviewArea');
        const changeImageBtn = $('changeImageBtn');
        
        // Close modal handlers
        backdrop.addEventListener('click', () => this.closeModal());
        closeBtn.addEventListener('click', () => this.closeModal());
        cancelBtn.addEventListener('click', () => this.closeModal());
        
        // Save handler
        saveBtn.addEventListener('click', () => this.saveMap());
        
        // Image upload handlers
        uploadArea.addEventListener('click', () => imageInput.click());
        
        uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadArea.classList.add('dragover');
        });
        
        uploadArea.addEventListener('dragleave', () => {
            uploadArea.classList.remove('dragover');
        });
        
        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.classList.remove('dragover');
            const file = e.dataTransfer.files[0];
            if (file && file.type.startsWith('image/')) {
                this.handleImageFile(file);
            }
        });
        
        imageInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                this.handleImageFile(file);
            }
        });
        
        changeImageBtn.addEventListener('click', () => {
            this.clearPendingImage();
            imageInput.click();
        });
        
        // Enter key to save
        $('mapNameInput').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                this.saveMap();
            }
        });
    }
    
    /**
     * Open the map creation modal
     * @param {string|null} [parentMapId] - Parent map ID for nested maps
     */
    openCreateModal(parentMapId = null) {
        this.clearPendingImage();
        
        $('mapModalTitle').textContent = 'New Map';
        $('mapNameInput').value = '';
        $('mapModalSave').textContent = 'Create Map';
        
        // Populate parent map dropdown
        const parentSelect = $('parentMapSelect');
        const state = this.store.getState();
        parentSelect.innerHTML = '<option value="">None (top-level map)</option>';
        
        Object.values(state.maps).forEach(map => {
            const option = document.createElement('option');
            option.value = map.id;
            option.textContent = map.name;
            if (map.id === parentMapId) {
                option.selected = true;
            }
            parentSelect.appendChild(option);
        });
        
        show($('mapModal'));
        $('mapNameInput').focus();
    }
    
    /**
     * Close the modal
     */
    closeModal() {
        hide($('mapModal'));
        this.clearPendingImage();
    }
    
    /**
     * Handle image file selection
     * @param {File} file 
     */
    async handleImageFile(file) {
        try {
            const dataUrl = await readFileAsDataURL(file);
            const img = await loadImage(dataUrl);
            
            this.pendingImageData = dataUrl;
            this.pendingImageWidth = img.width;
            this.pendingImageHeight = img.height;
            
            // Show preview
            $('imagePreview').src = dataUrl;
            hide($('imageUploadArea'));
            show($('imagePreviewArea'));
            
            // Auto-fill name from filename
            if (!$('mapNameInput').value) {
                const name = file.name.replace(/\.[^/.]+$/, ''); // Remove extension
                $('mapNameInput').value = name;
            }
        } catch (error) {
            console.error('Failed to load image:', error);
            alert('Failed to load image. Please try another file.');
        }
    }
    
    /**
     * Clear pending image
     */
    clearPendingImage() {
        this.pendingImageData = null;
        this.pendingImageWidth = 0;
        this.pendingImageHeight = 0;
        
        show($('imageUploadArea'));
        hide($('imagePreviewArea'));
        $('imagePreview').src = '';
        $('modalImageInput').value = '';
    }
    
    /**
     * Save the map
     */
    saveMap() {
        const name = $('mapNameInput').value.trim();
        const parentMapId = $('parentMapSelect').value || null;
        
        if (!name) {
            alert('Please enter a map name.');
            $('mapNameInput').focus();
            return;
        }
        
        if (!this.pendingImageData) {
            alert('Please upload a map image.');
            return;
        }
        
        const map = createMap({
            name,
            imageData: this.pendingImageData,
            imageWidth: this.pendingImageWidth,
            imageHeight: this.pendingImageHeight,
            parentMapId
        });
        
        this.store.setMap(map);
        this.eventBus.emit('map:select', map.id);
        
        this.closeModal();
    }
    
    /**
     * Handle file import
     * @param {File} file 
     */
    async handleImport(file) {
        try {
            const text = await file.text();
            const data = JSON.parse(text);
            
            if (!data.maps || typeof data.maps !== 'object') {
                throw new Error('Invalid file format');
            }
            
            const mapCount = Object.keys(data.maps).length;
            const existingCount = Object.keys(this.store.getState().maps).length;
            
            // Store the pending import data
            this.pendingImportData = data;
            
            if (existingCount > 0) {
                // Show the import modal with options
                $('importModalMessage').textContent = 
                    `You have ${existingCount} existing map(s). Importing ${mapCount} map(s).`;
                show($('importModal'));
            } else {
                // No existing maps, just import directly
                this.executeImport(false);
            }
        } catch (error) {
            console.error('Import failed:', error);
            alert(`Import failed: ${error.message}`);
        }
    }
    
    /**
     * Execute the import with merge or replace
     * @param {boolean} merge - If true, merge; if false, replace all
     */
    executeImport(merge) {
        if (!this.pendingImportData) return;
        
        const mapCount = Object.keys(this.pendingImportData.maps).length;
        
        if (merge) {
            const currentMaps = this.store.getState().maps;
            const mergedMaps = { ...currentMaps, ...this.pendingImportData.maps };
            this.store.setState({ maps: mergedMaps });
        } else {
            this.store.setState({ maps: this.pendingImportData.maps, currentMapId: null });
        }
        
        this.pendingImportData = null;
        alert(`Imported ${mapCount} map(s) successfully.`);
    }
    
    /**
     * Handle file export
     */
    handleExport() {
        const data = this.store.getSerializableData();
        const mapCount = Object.keys(data.maps).length;
        
        if (mapCount === 0) {
            alert('No maps to export.');
            return;
        }
        
        const json = JSON.stringify(data, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `map-pathfinder-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
}
