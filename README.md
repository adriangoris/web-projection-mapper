# 🎥 Projection Mapping Web

**[Open App](https://adriangoris.github.io/web-projection-mapper/app.html)**

A powerful, browser-based projection mapping tool built with WebGL. Create stunning visual projections by mapping videos, images, or camera feeds onto any surface with precise 4-corner perspective correction.

![Demo](demo.gif)

## Features

- **Multi-Layer Support** - Work with multiple layers simultaneously for complex compositions
- **Multiple Input Sources**
  - 📁 File upload (video/image)
  - 📷 Live camera feed
  - 🎨 Solid colors
- **Real-Time Warping** - Drag corner points to map your content onto any surface
- **Move Layers** - Grab a layer anywhere inside its shape and drag it
- **Custom Shapes** - Add points to a layer's outline to cut it into any polygon (arches, windows, triangles)
- **Layer Management** - Show/hide, reorder, and delete layers
- **Timeline Playback** - Sequence clips on per-layer tracks with a time ruler, playhead scrubbing, looping, and zoom
- **Saved Mappings** - Save the whole scene (layers, corners, clips, timeline) under a name and reopen it from the Mappings library
- **Projection Files** - Export a mapping with all its media as a single `.pmap` file and import it on another machine
- **Keyboard Shortcuts** - Fast workflow with hotkeys
- **Fullscreen Mode** - Perfect for live presentations
- **No Installation** - Runs entirely in your browser

## Usage

1. [Open App](https://adriangoris.github.io/web-projection-mapper/app.html) in your browser
2. Click **+ Add Layer** to create a new projection layer
3. Choose your content source:
   - **📁 File** - Upload a video or image
   - **📷 Camera** - Use your webcam
   - **🎨 Color** - Generate a solid color
4. Drag the corner points to map the content onto your target surface
5. Add more layers as needed for complex projections
6. Arrange clips in the **Timeline** at the bottom and press `Space` to play

## Timeline

The Timeline panel runs along the bottom of the screen:

- **Time Ruler** - Click or drag to scrub. `Ctrl`/`⌘` + scroll (or pinch) to zoom
- **Playhead** - The cyan marker and line showing the current time
- **Tracks** - One row per layer; click a track header to select that layer
- **Clips** - Each source you load becomes a clip. Drag a clip to move it (it snaps to the playhead and other clip edges), drag it onto another track to change its layer, and drag its edges to trim it
- Source buttons replace the **selected clip**. If no clip is selected, they add a new clip at the playhead (click an empty spot on a track to deselect)

## Layer Shapes

- **Move a layer** - Drag anywhere inside it. Clicking a layer on the canvas also selects it
- **Warp** - Drag the round corner handles (perspective warp, as before)
- **Add a point** - Double-click the dashed outline of the selected layer. The new diamond handle crops the layer: drag it inward to cut the shape
- **Remove a point** - Double-click it or `Alt`+click it. Doing this on a corner removes that corner from the shape (it turns hollow but still warps)
- **Reset shape** (`Shift`+`R`) - Back to the plain 4-corner quad. **Reset corners** (`R`) resets the warp only

Shape points are stored relative to the layer, so they follow it when you warp or move it. Hiding the points (`P`) also locks layers so they can't be dragged during a show.

## Saved Mappings

A mapping is everything you build in the app: its layers, corner positions, clips and timeline settings.

- **Save** (`Ctrl`/`⌘` + `S`) - Name the mapping in the box at the top of the panel and save it. The orange dot means there are unsaved changes
- **Save as** (`Ctrl`/`⌘` + `Shift` + `S`) - Save a copy under a new name
- **Mappings library** - The homepage (`/`, which opens `/mappings`) (the **Mappings** button in the panel) to see every saved mapping with a preview. Open, export or delete them from there, or start a new one
- Each saved mapping has its own link, `/app/<id>`, so you can open it on the projector machine
- Camera clips are saved as placeholders and ask for the camera again when the mapping opens

Saved mappings live on the server in `storage/` (set `STORAGE_PATH` to move it):

```
storage/mappings/<id>.json     mapping document
storage/mappings/<id>.jpg      preview thumbnail
storage/media/<sha256>.<ext>   video and image files, stored once and shared between mappings
```

### Projection files (.pmap)

**Export** downloads a `.pmap` file: a zip holding `mapping.json`, the thumbnail and every media file the mapping uses. **Import** (in the app or the library) turns a `.pmap` file back into a new saved mapping, so you can move work between machines or keep backups.

## Keyboard Shortcuts

| Key            | Action                                                     |
| -------------- | ---------------------------------------------------------- |
| `H`            | Toggle control panel                                       |
| `F`            | Toggle fullscreen                                          |
| `P`            | Toggle corner points visibility                            |
| `R`            | Reset active layer corners (`Shift`+`R`: reset its shape)  |
| `1-9`          | Switch between layers                                      |
| `T`            | Toggle timeline                                            |
| `Space`        | Play / pause                                               |
| `←` / `→`      | Step one frame (hold `Shift` for 1s)                       |
| `Home` / `End` | Jump to start / end                                        |
| `Delete`       | Delete selected clip (or active layer if no clip selected) |
| `Ctrl`/`⌘`+`S` | Save mapping (add `Shift` to save a copy)                  |

## Controls

- **Reset** - Reset corner positions to default
- **Points (P)** - Show/hide corner control points
- **Panel (H)** - Show/hide control panel
- **Fullscreen (F)** - Enter/exit fullscreen mode

## Technical Details

- Served by [AdonisJS 7](https://github.com/adonisjs/core) (Node.js), with pages rendered from Edge templates
- Frontend assets bundled by Vite through `@adonisjs/vite`
- Rendering is still vanilla JavaScript and WebGL, using a perspective-correction shader for accurate mapping
- Supports real-time video playback with hardware-accelerated rendering
- Media you load stays in the browser until you save; saving uploads it to the server running the app

## Development

Requires **Node.js 24+** (see `.nvmrc`) and npm.

```bash
nvm use                    # or install Node 24 another way
npm install
cp .env.example .env
node ace generate:key      # writes APP_KEY into .env
npm run dev                # http://localhost:3333 (with HMR)
```

| Script              | Purpose                                   |
| ------------------- | ----------------------------------------- |
| `npm run dev`       | Start the dev server with hot reloading   |
| `npm test`          | Run the Japa test suite                   |
| `npm run lint`      | Lint with ESLint                          |
| `npm run typecheck` | Type-check with TypeScript                |
| `npm run build`     | Create a production build in `build/`     |
| `npm start`         | Start the built server (run from `build`) |

### Production

```bash
npm run build
cd build
npm ci --omit=dev
cp ../.env .env            # set NODE_ENV=production, HOST, PORT, APP_KEY, APP_URL
node bin/server.js
```

Saved mappings go to `build/storage/` unless `STORAGE_PATH` points somewhere else. Set it to a folder outside `build/` (for example `STORAGE_PATH=/var/lib/projection-mapper`) so rebuilding doesn't touch your saved work.

### Project structure

```
start/routes.ts                     Routes: / (redirects to /mappings), /about, /app, and the /api
app/controllers/mappings_controller.ts  Library page, editor page, mappings API
app/services/mapping_store.ts       Saves mappings and media under storage/
app/services/projection_file.ts     .pmap export / import
app/services/zip.ts                 Minimal zip reader / writer
resources/views/pages/home.edge     Landing page (/about)
resources/views/pages/mapper.edge   Projection mapping app markup
resources/views/pages/mappings.edge Mappings library
resources/views/components/layouts/main.edge  Shared HTML layout
resources/js/mapper.js              WebGL renderer, layers, timeline, save / open
resources/js/library.js             Library page (delete, import)
resources/css/                      Page styles (home.css, mapper.css, library.css)
public/                             Static files (demo.gif)
storage/                            Saved mappings and media (git-ignored)
tests/                              Unit and HTTP tests
```

The old static URLs `/index.html` and `/app.html` redirect to `/` and `/app`.

## Browser Compatibility

Works in all modern browsers that support:

- WebGL
- MediaDevices API (for camera input)
- ES6+ JavaScript

## License

MIT License - Feel free to use for personal or commercial projects
