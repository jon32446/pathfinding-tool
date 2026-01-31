# Architecture

A quick reference for understanding the codebase structure and design.

## High-Level Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                           App (app.js)                          │
│                    Orchestrates everything                      │
└──────────────────────────┬──────────────────────────────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        ▼                  ▼                  ▼
┌───────────────┐  ┌───────────────┐  ┌───────────────┐
│   EventBus    │  │  StateStore   │  │    Storage    │
│  (pub/sub)    │◄─┤   (state)     │──┤ (persistence) │
└───────────────┘  └───────────────┘  └───────────────┘
        │                  │
        │    ┌─────────────┴─────────────┐
        │    ▼                           ▼
        │  ┌─────────────────┐  ┌─────────────────┐
        └─►│ UI Controllers  │  │     Engine      │
           │ (user actions)  │  │  (pathfinding)  │
           └─────────────────┘  └─────────────────┘
```

## Data Flow

**All state lives in StateStore.** Components never modify state directly or hold their own copy.

```
User Action → Controller → StateStore.setState() → Event Emitted → UI Updates
```

Example: User clicks to add a waypoint
1. `EditorController` detects click, calls `store.addWaypoint()`
2. `StateStore` updates internal state, emits `waypoint:added`
3. `CanvasRenderer` hears event, calls `renderWaypoints()`
4. SVG updates on screen

**Why this pattern?**
- Single source of truth prevents sync bugs
- Any component can react to any state change
- Easy to add features (just listen to events)
- Undo/redo is implemented by tracking state history

## Core Components

### `/js/core/`

| File | Purpose |
|------|---------|
| `EventBus.js` | Pub/sub messaging. Components communicate without direct references. |
| `StateStore.js` | Holds all app state. Emits events on changes. Has helpers for map/waypoint/edge CRUD. Manages undo/redo history. |
| `Storage.js` | IndexedDB persistence + JSON export/import. Auto-saves on state changes. Migrates from legacy LocalStorage. |

### `/js/ui/`

| File | Purpose |
|------|---------|
| `CanvasRenderer.js` | Renders map image + SVG overlay. Handles pan/zoom transforms. |
| `EditorController.js` | Edit mode: waypoint/edge creation, selection, dragging, bezier control points. |
| `ViewerController.js` | View mode: start/end selection, triggers pathfinding, pan navigation. |
| `Toolbar.js` | Mode toggle (edit/view), import/export buttons. |
| `Sidebar.js` | Map tree navigation, properties panel for selected items. |
| `MapManager.js` | Map creation modal, image upload handling. |

### `/js/engine/`

| File | Purpose |
|------|---------|
| `Pathfinder.js` | Dijkstra's algorithm + Yen's K-shortest paths for alternatives. |
| `BezierUtils.js` | Cubic bezier math: length calculation, point sampling, hit testing. |

### `/js/models/`

| File | Purpose |
|------|---------|
| `Map.js` | Map data structure, tree utilities for nested maps. |
| `Waypoint.js` | Waypoint data, portal helpers. |
| `Edge.js` | Edge data, straight/bezier conversion, cost override flag. |
| `Terrain.js` | Terrain layer grid, terrain types, cost calculation utilities. |

### `/js/utils/`

| File | Purpose |
|------|---------|
| `helpers.js` | ID generation, math utilities, debounce/throttle. |
| `geometry.js` | Hit testing, distance calculations, coordinate transforms. |
| `dom.js` | DOM/SVG element creation, file I/O helpers. |

## Key Design Decisions

### SVG Overlay (not Canvas)
Waypoints and edges are SVG elements, not drawn on a canvas. This gives us:
- Native hit testing (no manual coordinate math for clicks)
- CSS styling and transitions
- Crisp rendering at any zoom level
- Easy DOM inspection for debugging

The map image is a regular `<img>` underneath.

### EventBus over Direct References
Components don't hold references to each other. They communicate through events:
```js
// Bad: tight coupling
this.renderer.renderWaypoints();

// Good: loose coupling
this.eventBus.emit('waypoint:added', waypoint);
// CanvasRenderer listens and handles it
```

This makes it easy to add new features that react to existing events.

### Coordinates
- **Canvas coordinates**: Relative to the map image (0,0 = top-left of image)
- **Screen coordinates**: Browser viewport pixels

`CanvasRenderer.screenToCanvas()` converts between them, accounting for pan and zoom.

### Bezier Curves
Edges can be straight lines or cubic bezier curves. Bezier edges store two control points. The pathfinder calculates actual curve length (not straight-line distance) for accurate costs.

### Terrain System
Maps can have an optional terrain layer - a low-resolution grid overlaying the map image. Each cell contains a terrain type (forest, mountain, water, etc.) with an associated movement cost multiplier.

**Key concepts:**
- **Grid**: ~100x100 cells, stored as flat array of type IDs
- **Terrain types**: Predefined set with costs (clear=1, mountain=5, water=8, etc.)
- **Auto edge costs**: Edges sample terrain along their path; cost = distance × terrain multiplier
- **Manual override**: Edges can have `costOverride: true` to ignore terrain
- **Arbitrary routing**: In view mode, Shift+click sets start/end anywhere; cost from terrain

**Paint tool (Edit mode, T key):**
- Brush paints terrain cells
- Adjustable brush size (1-10 cells)
- Eraser removes terrain
- "Recalc All Costs" updates all non-overridden edges

### Undo/Redo System

Full undo/redo support via state snapshots in `StateStore`.

**Key concepts:**
- **History array**: Stores snapshots of mutable map data (waypoints, edges, terrain)
- **Excludes images**: Map images are static after creation, so not stored in history (saves memory)
- **hasUnsavedChanges flag**: Tracks if current state differs from last history entry
- **Batch operations**: Multiple changes can be grouped into a single undo step

**History flow:**
```
pushHistory() → saves state BEFORE mutation
mutation happens → state changes
undo() → if hasUnsavedChanges, saves current state first, then restores previous
redo() → restores next state in history
```

**Batch operations** (`beginBatch()` / `endBatch()`):
- Groups multiple mutations into single undo step
- Used by: "Connect All Neighbors", Shift+click waypoint, "Recalc All Costs"
- History pushed once at batch start; individual mutations skip pushing
- Batches can be nested

**Memory efficiency:**
- Only mutable data stored (waypoints, edges, terrain grid)
- Map images (~MB) excluded → snapshots are typically ~10-50KB
- Max 100 history entries (configurable via `MAX_HISTORY_SIZE`)

## State Shape

```js
{
  mode: 'edit' | 'view',
  currentTool: 'select' | 'waypoint' | 'edge' | 'paint' | 'pan',
  currentMapId: string | null,
  maps: {
    [mapId]: {
      id, name, imageData, imageWidth, imageHeight,
      waypoints: [{ id, x, y, name?, isPortal?, portalTargetMapId? }],
      edges: [{ id, from, to, cost, type, controlPoints?, bidirectional, costOverride? }],
      terrain: { gridWidth, gridHeight, grid: string[], types: TerrainType[] } | null,
      parentMapId?
    }
  },
  selectedWaypoint: string | null,
  selectedEdge: string | null,
  routeStart: string | null,
  routeEnd: string | null,
  currentRoute: { path, cost, edges } | null,
  alternativeRoute: { path, cost, edges } | null,
  zoom: number,
  pan: { x, y }
}
```

## Adding Features

**New tool in edit mode:**
1. Add button to toolbar in `index.html`
2. Handle tool selection in `EditorController.selectTool()`
3. Add click/drag behavior in `handleMouseDown()` etc.

**New property on waypoints/edges:**
1. Add field to model in `/js/models/`
2. Update `createWaypoint()` or `createEdge()` factory
3. Add UI in `Sidebar.showWaypointProperties()` or `showEdgeProperties()`

**React to new state:**
1. Emit event from `StateStore.setState()` (see existing pattern)
2. Listen in relevant component with `eventBus.on('event:name', handler)`

## Deployment

### GitHub Actions (`.github/workflows/deploy.yml`)

On push to `master`:
1. Checks out code
2. Injects git short hash and build date into `js/version.js`
3. Uploads to GitHub Pages

**Version display:**
- `js/version.js` exports `VERSION` and `BUILD_DATE`
- Shows "dev" / "local" for local development
- Shows git hash (e.g., "a1b2c3d") when deployed via Actions
- Displayed in status bar bottom-right
