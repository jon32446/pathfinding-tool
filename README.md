# Map Pathfinder

A web-based tool for creating and navigating maps with waypoints, edges, and pathfinding capabilities. Designed to be hosted on GitHub Pages with no backend required.

## Features

- **Image-based maps**: Upload any image as a map background
- **Nested maps**: Create hierarchies of maps (world map → city map → building)
- **Waypoint editing**: Add, move, rename, and delete waypoints
- **Edge creation**: Connect waypoints with straight lines or bezier curves
- **Auto-connect**: Shift+click or "Connect All Neighbors" to automatically link waypoints
- **Terrain painting**: Paint terrain types (mountains, forests, water) with cost multipliers
- **Auto-calculated costs**: Edge costs automatically derive from terrain traversed
- **Custom costs**: Override automatic costs for special cases (bridges, tunnels, etc.)
- **Pathfinding**: Find the shortest path between two waypoints
- **Arbitrary routing**: Shift+click anywhere to route to/from non-waypoint locations
- **Alternative routes**: View a second-best route option
- **Portal navigation**: Double-click portals to navigate to linked maps
- **Undo/Redo**: Full undo history with Ctrl+Z / Ctrl+Y
- **Auto-save**: Changes are automatically saved to browser IndexedDB
- **Import/Export**: Save and load your maps as JSON files

## Getting Started

### Local Development

Due to ES Modules, you need a local web server (opening `index.html` directly won't work due to CORS):

```bash
# Using Python 3
python -m http.server 8000

# Then open http://localhost:8000
```

### GitHub Pages Deployment

1. Push this folder to a GitHub repository
2. GitHub Actions will automatically deploy to Pages (see `.github/workflows/deploy.yml`)
3. Access via `https://yourusername.github.io/repository-name/`

The deployment automatically injects the git commit hash as a version indicator (shown in the status bar).

## Usage

### Edit Mode

1. **Create a map**: Click the "+" button in the Maps sidebar or "Upload Map Image"
2. **Add waypoints**: Select the waypoint tool (W) and click on the map
   - Shift+click to auto-connect to nearby waypoints
3. **Connect waypoints**: Select the edge tool (E), click a waypoint, then click another
   - Or use "Connect All Neighbors" in the Waypoints palette
4. **Paint terrain**: Select the terrain tool (T) and paint terrain types
   - Adjust brush size and select terrain type in the palette
   - Edge costs automatically update based on terrain
5. **Set edge cost**: Select an edge and change the cost in the Properties panel
   - Toggle "Manual override" to prevent terrain auto-calculation
6. **Create curves**: Right-click an edge and select "Convert to Curve", then drag control points
7. **Create portals**: Check "Portal" in waypoint properties and select target map

### View Mode

1. **Select start**: Click a waypoint to set it as the route start (green)
   - Or Shift+click anywhere on the map for arbitrary start point
2. **Select end**: Click another waypoint to set it as the destination (red)
   - Or Shift+click anywhere for arbitrary end point
3. **Find route**: Click "Find Route" to calculate the optimal path
4. **View alternatives**: The alternative route (if any) is shown as a dashed line
5. **Navigate portals**: Double-click a portal waypoint to go to the linked map

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| V | Select tool |
| W | Waypoint tool |
| E | Edge tool |
| T | Terrain paint tool |
| Delete/Backspace | Delete selected item |
| Escape | Cancel current action |
| Ctrl/Cmd + Z | Undo |
| Ctrl/Cmd + Shift + Z | Redo |
| Ctrl/Cmd + Y | Redo (alternative) |
| Ctrl/Cmd + + | Zoom in |
| Ctrl/Cmd + - | Zoom out |
| Ctrl/Cmd + 0 | Reset zoom |
| Space + Drag | Pan the map |
| Middle mouse + Drag | Pan the map |
| Scroll wheel | Zoom in/out |

### Pan and Zoom

- **Scroll wheel**: Zoom in/out centered on cursor
- **Middle mouse button + drag**: Pan the map
- **Space + drag**: Pan the map
- **Zoom controls**: Use the buttons in the bottom-right corner

## File Structure

```
pathfinding-tool/
├── index.html          # Main HTML file
├── css/
│   ├── main.css       # Core styles and variables
│   ├── toolbar.css    # Toolbar styles
│   ├── canvas.css     # Canvas and overlay styles
│   └── sidebar.css    # Sidebar styles
├── js/
│   ├── app.js         # Application entry point
│   ├── version.js     # Version info (auto-generated on deploy)
│   ├── core/          # Core infrastructure
│   │   ├── EventBus.js    # Pub/sub messaging
│   │   ├── StateStore.js  # Central state management + undo/redo
│   │   └── Storage.js     # IndexedDB persistence
│   ├── models/        # Data models
│   │   ├── Map.js
│   │   ├── Waypoint.js
│   │   ├── Edge.js
│   │   └── Terrain.js     # Terrain layer and cost calculations
│   ├── engine/        # Pathfinding algorithms
│   │   ├── Pathfinder.js  # Dijkstra + Yen's K-shortest
│   │   └── BezierUtils.js # Curve calculations
│   ├── ui/            # UI components
│   │   ├── CanvasRenderer.js
│   │   ├── EditorController.js
│   │   ├── ViewerController.js
│   │   ├── Toolbar.js
│   │   ├── Sidebar.js
│   │   └── MapManager.js
│   └── utils/         # Utilities
│       ├── helpers.js
│       ├── geometry.js
│       └── dom.js
├── .github/
│   └── workflows/
│       └── deploy.yml  # GitHub Actions deployment
├── README.md
└── ARCHITECTURE.md     # Technical architecture docs
```

## Data Storage

- **Auto-save**: Maps are automatically saved to browser IndexedDB (supports larger maps than LocalStorage)
- **Export**: Download all maps as a JSON file via the export button
- **Import**: Upload a previously exported JSON file to restore maps (merge or replace)
- **Migration**: If you have data from an older version using LocalStorage, it will be automatically migrated

Note: IndexedDB is per-browser and not synced across devices. Use export/import to transfer maps.

## Browser Compatibility

Works in all modern browsers:
- Chrome 80+
- Firefox 75+
- Safari 13.1+
- Edge 80+

Requires ES Modules support (no IE11).

## License

MIT License - feel free to use and modify for your projects.
