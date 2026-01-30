/**
 * Geometry Utilities - Hit testing, distance calculations, etc.
 */

/**
 * Calculate distance between two points
 * @param {number} x1 
 * @param {number} y1 
 * @param {number} x2 
 * @param {number} y2 
 * @returns {number}
 */
export function distance(x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Calculate distance from a point to a line segment
 * @param {number} px - Point X
 * @param {number} py - Point Y
 * @param {number} x1 - Line start X
 * @param {number} y1 - Line start Y
 * @param {number} x2 - Line end X
 * @param {number} y2 - Line end Y
 * @returns {number}
 */
export function distanceToLineSegment(px, py, x1, y1, x2, y2) {
    const A = px - x1;
    const B = py - y1;
    const C = x2 - x1;
    const D = y2 - y1;
    
    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    let param = -1;
    
    if (lenSq !== 0) {
        param = dot / lenSq;
    }
    
    let xx, yy;
    
    if (param < 0) {
        xx = x1;
        yy = y1;
    } else if (param > 1) {
        xx = x2;
        yy = y2;
    } else {
        xx = x1 + param * C;
        yy = y1 + param * D;
    }
    
    const dx = px - xx;
    const dy = py - yy;
    return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Check if a point is within a rectangle
 * @param {number} px 
 * @param {number} py 
 * @param {number} rx - Rectangle left
 * @param {number} ry - Rectangle top
 * @param {number} rw - Rectangle width
 * @param {number} rh - Rectangle height
 * @returns {boolean}
 */
export function pointInRect(px, py, rx, ry, rw, rh) {
    return px >= rx && px <= rx + rw && py >= ry && py <= ry + rh;
}

/**
 * Check if a point is within a circle
 * @param {number} px 
 * @param {number} py 
 * @param {number} cx - Circle center X
 * @param {number} cy - Circle center Y
 * @param {number} radius 
 * @returns {boolean}
 */
export function pointInCircle(px, py, cx, cy, radius) {
    const dx = px - cx;
    const dy = py - cy;
    return dx * dx + dy * dy <= radius * radius;
}

/**
 * Get the midpoint between two points
 * @param {number} x1 
 * @param {number} y1 
 * @param {number} x2 
 * @param {number} y2 
 * @returns {{x: number, y: number}}
 */
export function midpoint(x1, y1, x2, y2) {
    return {
        x: (x1 + x2) / 2,
        y: (y1 + y2) / 2
    };
}

/**
 * Get the angle between two points in radians
 * @param {number} x1 
 * @param {number} y1 
 * @param {number} x2 
 * @param {number} y2 
 * @returns {number}
 */
export function angleBetween(x1, y1, x2, y2) {
    return Math.atan2(y2 - y1, x2 - x1);
}

/**
 * Calculate a point along a line at a given distance from start
 * @param {number} x1 - Start X
 * @param {number} y1 - Start Y
 * @param {number} x2 - End X
 * @param {number} y2 - End Y
 * @param {number} dist - Distance from start
 * @returns {{x: number, y: number}}
 */
export function pointAlongLine(x1, y1, x2, y2, dist) {
    const length = distance(x1, y1, x2, y2);
    if (length === 0) return { x: x1, y: y1 };
    
    const ratio = dist / length;
    return {
        x: x1 + (x2 - x1) * ratio,
        y: y1 + (y2 - y1) * ratio
    };
}

/**
 * Get bounding box of a set of points
 * @param {{x: number, y: number}[]} points 
 * @returns {{x: number, y: number, width: number, height: number}}
 */
export function getBoundingBox(points) {
    if (points.length === 0) {
        return { x: 0, y: 0, width: 0, height: 0 };
    }
    
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    
    points.forEach(p => {
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x);
        maxY = Math.max(maxY, p.y);
    });
    
    return {
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY
    };
}

/**
 * Transform a point from screen coordinates to canvas coordinates
 * @param {number} screenX 
 * @param {number} screenY 
 * @param {{x: number, y: number}} pan - Current pan offset
 * @param {number} zoom - Current zoom level
 * @param {DOMRect} containerRect - Container bounding rect
 * @returns {{x: number, y: number}}
 */
export function screenToCanvas(screenX, screenY, pan, zoom, containerRect) {
    const x = (screenX - containerRect.left - pan.x) / zoom;
    const y = (screenY - containerRect.top - pan.y) / zoom;
    return { x, y };
}

/**
 * Transform a point from canvas coordinates to screen coordinates
 * @param {number} canvasX 
 * @param {number} canvasY 
 * @param {{x: number, y: number}} pan - Current pan offset
 * @param {number} zoom - Current zoom level
 * @param {DOMRect} containerRect - Container bounding rect
 * @returns {{x: number, y: number}}
 */
export function canvasToScreen(canvasX, canvasY, pan, zoom, containerRect) {
    const x = canvasX * zoom + pan.x + containerRect.left;
    const y = canvasY * zoom + pan.y + containerRect.top;
    return { x, y };
}
