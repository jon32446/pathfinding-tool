/**
 * DOM Helper Utilities
 */

/**
 * Create an SVG element with attributes
 * @param {string} tag - SVG element tag name
 * @param {Object} attrs - Attributes to set
 * @returns {SVGElement}
 */
export function createSvgElement(tag, attrs = {}) {
    const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [key, value] of Object.entries(attrs)) {
        el.setAttribute(key, value);
    }
    return el;
}

/**
 * Set multiple attributes on an element
 * @param {Element} el 
 * @param {Object} attrs 
 */
export function setAttributes(el, attrs) {
    for (const [key, value] of Object.entries(attrs)) {
        if (value === null || value === undefined) {
            el.removeAttribute(key);
        } else {
            el.setAttribute(key, value);
        }
    }
}

/**
 * Remove all children from an element
 * @param {Element} el 
 */
export function clearElement(el) {
    while (el.firstChild) {
        el.removeChild(el.firstChild);
    }
}

/**
 * Add event listeners to an element
 * @param {Element} el 
 * @param {Object.<string, Function>} events - Event name to handler map
 * @returns {Function} Function to remove all listeners
 */
export function addEventListeners(el, events) {
    for (const [event, handler] of Object.entries(events)) {
        el.addEventListener(event, handler);
    }
    
    return () => {
        for (const [event, handler] of Object.entries(events)) {
            el.removeEventListener(event, handler);
        }
    };
}

/**
 * Show an element (remove hidden class)
 * @param {Element} el 
 */
export function show(el) {
    el.classList.remove('hidden');
}

/**
 * Hide an element (add hidden class)
 * @param {Element} el 
 */
export function hide(el) {
    el.classList.add('hidden');
}

/**
 * Toggle element visibility
 * @param {Element} el 
 * @param {boolean} [visible] - Force specific state
 */
export function toggle(el, visible) {
    if (visible === undefined) {
        el.classList.toggle('hidden');
    } else if (visible) {
        show(el);
    } else {
        hide(el);
    }
}

/**
 * Get element by ID with type assertion
 * @template {HTMLElement} T
 * @param {string} id 
 * @returns {T}
 */
export function $(id) {
    return document.getElementById(id);
}

/**
 * Query selector shorthand
 * @param {string} selector 
 * @param {Element} [parent=document] 
 * @returns {Element|null}
 */
export function qs(selector, parent = document) {
    return parent.querySelector(selector);
}

/**
 * Query selector all shorthand
 * @param {string} selector 
 * @param {Element} [parent=document] 
 * @returns {NodeListOf<Element>}
 */
export function qsa(selector, parent = document) {
    return parent.querySelectorAll(selector);
}

/**
 * Create an HTML element with attributes and children
 * @param {string} tag 
 * @param {Object} [attrs] 
 * @param {(Element|string)[]} [children] 
 * @returns {HTMLElement}
 */
export function createElement(tag, attrs = {}, children = []) {
    const el = document.createElement(tag);
    
    for (const [key, value] of Object.entries(attrs)) {
        if (key === 'className') {
            el.className = value;
        } else if (key === 'style' && typeof value === 'object') {
            Object.assign(el.style, value);
        } else if (key.startsWith('on') && typeof value === 'function') {
            el.addEventListener(key.slice(2).toLowerCase(), value);
        } else {
            el.setAttribute(key, value);
        }
    }
    
    children.forEach(child => {
        if (typeof child === 'string') {
            el.appendChild(document.createTextNode(child));
        } else if (child instanceof Element) {
            el.appendChild(child);
        }
    });
    
    return el;
}

/**
 * Load an image and return a promise
 * @param {string} src - Image source (URL or data URL)
 * @returns {Promise<HTMLImageElement>}
 */
export function loadImage(src) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Failed to load image'));
        img.src = src;
    });
}

/**
 * Read a file as data URL
 * @param {File} file 
 * @returns {Promise<string>}
 */
export function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
    });
}

/**
 * Download data as a file
 * @param {string} data - Data to download
 * @param {string} filename 
 * @param {string} mimeType 
 */
export function downloadFile(data, filename, mimeType = 'application/octet-stream') {
    const blob = new Blob([data], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
