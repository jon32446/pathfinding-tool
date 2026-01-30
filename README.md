# Map Pathfinder

A web-based tool for creating and navigating maps with waypoints, edges, and pathfinding capabilities. Designed to be hosted on GitHub Pages with no backend required.

## Features

- **Image-based maps**: Upload any image as a map background
- **Nested maps**: Create hierarchies of maps (world map → city map → building)
- **Waypoint editing**: Add, move, rename, and delete waypoints
- **Edge creation**: Connect waypoints with straight lines or bezier curves
- **Custom costs**: Set costs for each edge to represent travel difficulty
- **Pathfinding**: Find the shortest path between two waypoints
- **Alternative routes**: View a second-best route option
- **Portal navigation**: Double-click portals to navigate to linked maps
- **Auto-save**: Changes are automatically saved to browser storage
- **Import/Export**: Save and load your maps as JSON files

## Getting Started

Simply open `index.html` in a modern web browser. No build step or server required!

For GitHub Pages deployment:
1. Push this folder to a GitHub repository
2. Enable GitHub Pages in repository settings
3. Access via `https://yourusername.github.io/repository-name/`

## Usage

### Edit Mode

1. **Create a map**: Click the "+" button in the Maps sidebar or "Upload Map Image"
2. **Add waypoints**: Select the waypoint tool (W) and click on the map
3. **Connect waypoints**: Select the edge tool (E), click a waypoint, then click another
4. **Set edge cost**: Select an edge and change the cost in the Properties panel
5. **Create curves**: Right-click an edge and select "Convert to Curve", then drag control points
6. **Create portals**: Check "Portal" in waypoint properties and select target map

### View Mode

1. **Select start**: Click a waypoint to set it as the route start (green)
2. **Select end**: Click another waypoint to set it as the destination (red)
3. **Find route**: Click "Find Route" to calculate the optimal path
4. **View alternatives**: The alternative route (if any) is shown as a dashed line
5. **Navigate portals**: Double-click a portal waypoint to go to the linked map

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| V | Select tool |
| W | Waypoint tool |
| E | Edge tool |
| Delete/Backspace | Delete selected item |
| Escape | Cancel current action |
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
│   ├── core/          # Core infrastructure
│   │   ├── EventBus.js    # Pub/sub messaging
│   │   ├── StateStore.js  # Central state management
│   │   └── Storage.js     # LocalStorage persistence
│   ├── models/        # Data models
│   │   ├── Map.js
│   │   ├── Waypoint.js
│   │   └── Edge.js
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
└── README.md
```

## Data Storage

- **Auto-save**: Maps are automatically saved to browser LocalStorage
- **Export**: Download all maps as a JSON file via the export button
- **Import**: Upload a previously exported JSON file to restore maps

Note: LocalStorage is per-browser and not synced across devices. Use export/import to transfer maps.

## Browser Compatibility

Works in all modern browsers:
- Chrome 80+
- Firefox 75+
- Safari 13.1+
- Edge 80+

Requires ES Modules support (no IE11).

## License

MIT License - feel free to use and modify for your projects.
