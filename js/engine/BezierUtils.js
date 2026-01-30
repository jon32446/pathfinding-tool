/**
 * BezierUtils - Utilities for cubic bezier curve calculations
 * 
 * Used for calculating curve lengths, points along curves,
 * and hit testing for bezier edges.
 */

/**
 * @typedef {Object} Point
 * @property {number} x
 * @property {number} y
 */

/**
 * Calculate a point on a cubic bezier curve at parameter t
 * @param {Point} p0 - Start point
 * @param {Point} p1 - First control point
 * @param {Point} p2 - Second control point
 * @param {Point} p3 - End point
 * @param {number} t - Parameter (0-1)
 * @returns {Point}
 */
export function cubicBezierPoint(p0, p1, p2, p3, t) {
    const t2 = t * t;
    const t3 = t2 * t;
    const mt = 1 - t;
    const mt2 = mt * mt;
    const mt3 = mt2 * mt;
    
    return {
        x: mt3 * p0.x + 3 * mt2 * t * p1.x + 3 * mt * t2 * p2.x + t3 * p3.x,
        y: mt3 * p0.y + 3 * mt2 * t * p1.y + 3 * mt * t2 * p2.y + t3 * p3.y
    };
}

/**
 * Calculate the derivative of a cubic bezier curve at parameter t
 * @param {Point} p0 
 * @param {Point} p1 
 * @param {Point} p2 
 * @param {Point} p3 
 * @param {number} t 
 * @returns {Point}
 */
export function cubicBezierDerivative(p0, p1, p2, p3, t) {
    const t2 = t * t;
    const mt = 1 - t;
    const mt2 = mt * mt;
    
    return {
        x: 3 * mt2 * (p1.x - p0.x) + 6 * mt * t * (p2.x - p1.x) + 3 * t2 * (p3.x - p2.x),
        y: 3 * mt2 * (p1.y - p0.y) + 6 * mt * t * (p2.y - p1.y) + 3 * t2 * (p3.y - p2.y)
    };
}

/**
 * Calculate the approximate length of a cubic bezier curve
 * Uses adaptive subdivision for accuracy
 * @param {Point} p0 
 * @param {Point} p1 
 * @param {Point} p2 
 * @param {Point} p3 
 * @param {number} [segments=50] - Number of segments for approximation
 * @returns {number}
 */
export function getBezierLength(p0, p1, p2, p3, segments = 50) {
    let length = 0;
    let prevPoint = p0;
    
    for (let i = 1; i <= segments; i++) {
        const t = i / segments;
        const point = cubicBezierPoint(p0, p1, p2, p3, t);
        const dx = point.x - prevPoint.x;
        const dy = point.y - prevPoint.y;
        length += Math.sqrt(dx * dx + dy * dy);
        prevPoint = point;
    }
    
    return length;
}

/**
 * Get multiple points along a bezier curve
 * @param {Point} p0 
 * @param {Point} p1 
 * @param {Point} p2 
 * @param {Point} p3 
 * @param {number} count - Number of points to generate
 * @returns {Point[]}
 */
export function getBezierPoints(p0, p1, p2, p3, count) {
    const points = [];
    for (let i = 0; i <= count; i++) {
        const t = i / count;
        points.push(cubicBezierPoint(p0, p1, p2, p3, t));
    }
    return points;
}

/**
 * Find the closest point on a bezier curve to a given point
 * @param {Point} p0 
 * @param {Point} p1 
 * @param {Point} p2 
 * @param {Point} p3 
 * @param {Point} point - The point to find closest to
 * @param {number} [samples=50] - Number of samples for initial search
 * @returns {{point: Point, t: number, distance: number}}
 */
export function closestPointOnBezier(p0, p1, p2, p3, point, samples = 50) {
    let minDist = Infinity;
    let minT = 0;
    let minPoint = p0;
    
    // Initial coarse search
    for (let i = 0; i <= samples; i++) {
        const t = i / samples;
        const bezierPoint = cubicBezierPoint(p0, p1, p2, p3, t);
        const dx = bezierPoint.x - point.x;
        const dy = bezierPoint.y - point.y;
        const dist = dx * dx + dy * dy; // Squared distance for speed
        
        if (dist < minDist) {
            minDist = dist;
            minT = t;
            minPoint = bezierPoint;
        }
    }
    
    // Refine with binary search
    let low = Math.max(0, minT - 1 / samples);
    let high = Math.min(1, minT + 1 / samples);
    
    for (let i = 0; i < 10; i++) {
        const mid1 = low + (high - low) / 3;
        const mid2 = high - (high - low) / 3;
        
        const p1_ = cubicBezierPoint(p0, p1, p2, p3, mid1);
        const p2_ = cubicBezierPoint(p0, p1, p2, p3, mid2);
        
        const d1 = (p1_.x - point.x) ** 2 + (p1_.y - point.y) ** 2;
        const d2 = (p2_.x - point.x) ** 2 + (p2_.y - point.y) ** 2;
        
        if (d1 < d2) {
            high = mid2;
            if (d1 < minDist) {
                minDist = d1;
                minT = mid1;
                minPoint = p1_;
            }
        } else {
            low = mid1;
            if (d2 < minDist) {
                minDist = d2;
                minT = mid2;
                minPoint = p2_;
            }
        }
    }
    
    return {
        point: minPoint,
        t: minT,
        distance: Math.sqrt(minDist)
    };
}

/**
 * Get the bounding box of a bezier curve
 * @param {Point} p0 
 * @param {Point} p1 
 * @param {Point} p2 
 * @param {Point} p3 
 * @returns {{minX: number, minY: number, maxX: number, maxY: number}}
 */
export function getBezierBoundingBox(p0, p1, p2, p3) {
    // Find extrema
    const extremaT = [];
    
    // x extrema
    const ax = -3 * p0.x + 9 * p1.x - 9 * p2.x + 3 * p3.x;
    const bx = 6 * p0.x - 12 * p1.x + 6 * p2.x;
    const cx = -3 * p0.x + 3 * p1.x;
    
    if (Math.abs(ax) > 1e-10) {
        const disc = bx * bx - 4 * ax * cx;
        if (disc >= 0) {
            const sqrtDisc = Math.sqrt(disc);
            const t1 = (-bx + sqrtDisc) / (2 * ax);
            const t2 = (-bx - sqrtDisc) / (2 * ax);
            if (t1 > 0 && t1 < 1) extremaT.push(t1);
            if (t2 > 0 && t2 < 1) extremaT.push(t2);
        }
    } else if (Math.abs(bx) > 1e-10) {
        const t = -cx / bx;
        if (t > 0 && t < 1) extremaT.push(t);
    }
    
    // y extrema
    const ay = -3 * p0.y + 9 * p1.y - 9 * p2.y + 3 * p3.y;
    const by = 6 * p0.y - 12 * p1.y + 6 * p2.y;
    const cy = -3 * p0.y + 3 * p1.y;
    
    if (Math.abs(ay) > 1e-10) {
        const disc = by * by - 4 * ay * cy;
        if (disc >= 0) {
            const sqrtDisc = Math.sqrt(disc);
            const t1 = (-by + sqrtDisc) / (2 * ay);
            const t2 = (-by - sqrtDisc) / (2 * ay);
            if (t1 > 0 && t1 < 1) extremaT.push(t1);
            if (t2 > 0 && t2 < 1) extremaT.push(t2);
        }
    } else if (Math.abs(by) > 1e-10) {
        const t = -cy / by;
        if (t > 0 && t < 1) extremaT.push(t);
    }
    
    // Include endpoints
    extremaT.push(0, 1);
    
    // Find bounds
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;
    
    extremaT.forEach(t => {
        const point = cubicBezierPoint(p0, p1, p2, p3, t);
        minX = Math.min(minX, point.x);
        minY = Math.min(minY, point.y);
        maxX = Math.max(maxX, point.x);
        maxY = Math.max(maxY, point.y);
    });
    
    return { minX, minY, maxX, maxY };
}

/**
 * Split a bezier curve at parameter t using de Casteljau's algorithm
 * @param {Point} p0 
 * @param {Point} p1 
 * @param {Point} p2 
 * @param {Point} p3 
 * @param {number} t 
 * @returns {{left: Point[], right: Point[]}}
 */
export function splitBezier(p0, p1, p2, p3, t) {
    const lerp = (a, b, t) => ({
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t
    });
    
    const p01 = lerp(p0, p1, t);
    const p12 = lerp(p1, p2, t);
    const p23 = lerp(p2, p3, t);
    const p012 = lerp(p01, p12, t);
    const p123 = lerp(p12, p23, t);
    const p0123 = lerp(p012, p123, t);
    
    return {
        left: [p0, p01, p012, p0123],
        right: [p0123, p123, p23, p3]
    };
}

/**
 * Generate SVG path data for a cubic bezier
 * @param {Point} p0 
 * @param {Point} p1 
 * @param {Point} p2 
 * @param {Point} p3 
 * @returns {string}
 */
export function bezierToSvgPath(p0, p1, p2, p3) {
    return `M ${p0.x} ${p0.y} C ${p1.x} ${p1.y}, ${p2.x} ${p2.y}, ${p3.x} ${p3.y}`;
}
