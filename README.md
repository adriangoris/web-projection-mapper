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
- **Layer Management** - Show/hide, reorder, and delete layers
- **Timeline Playback** - Sequence clips on per-layer tracks with a time ruler, playhead scrubbing, looping, and zoom
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

## Keyboard Shortcuts

| Key            | Action                                                     |
| -------------- | ---------------------------------------------------------- |
| `H`            | Toggle control panel                                       |
| `F`            | Toggle fullscreen                                          |
| `P`            | Toggle corner points visibility                            |
| `R`            | Reset active layer corners                                 |
| `1-9`          | Switch between layers                                      |
| `T`            | Toggle timeline                                            |
| `Space`        | Play / pause                                               |
| `←` / `→`      | Step one frame (hold `Shift` for 1s)                       |
| `Home` / `End` | Jump to start / end                                        |
| `Delete`       | Delete selected clip (or active layer if no clip selected) |

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
- All media stays in the browser: nothing is uploaded to the server

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

### Project structure

```
start/routes.ts                     Routes: / (landing) and /app (mapper)
resources/views/pages/home.edge     Landing page
resources/views/pages/mapper.edge   Projection mapping app markup
resources/views/components/layouts/main.edge  Shared HTML layout
resources/js/mapper.js              WebGL renderer, layers, timeline
resources/css/                      Page styles (home.css, mapper.css)
public/                             Static files (demo.gif)
tests/functional/                   HTTP tests
```

The old static URLs `/index.html` and `/app.html` redirect to `/` and `/app`.

## Browser Compatibility

Works in all modern browsers that support:

- WebGL
- MediaDevices API (for camera input)
- ES6+ JavaScript

## License

MIT License - Feel free to use for personal or commercial projects
