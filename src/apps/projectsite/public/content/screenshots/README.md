# Screenshots Directory

This directory contains screenshots and images used in the documentation and tutorials.

## Current Placeholders

The following screenshots are referenced in the content but need to be created:

### Editor Screenshots
- `editor-overview.png` - Main editor interface with labeled panels
- `create-mesh-button.png` - New Mesh button in Assets panel
- `mesh-designer-canvas.png` - Mesh designer showing triangle creation
- `mesh-designer-spaceship.png` - Complex spaceship mesh with vertices
- `mesh-properties-panel.png` - Properties panel with metadata fields

### VS Code Screenshots
- `vscode-project-structure.png` - Project structure in explorer
- `vscode-actor-creation.png` - Actor creation code with IntelliSense
- `vscode-extensions.png` - Recommended extensions panel

### Gameplay Screenshots
- `hello-world-running.png` - First game running in browser
- `physics-debug-mode.png` - Debug view with collider wireframes

### Diagrams
- `physics-forces-diagram.png` - Force vectors illustration

### Terminal Screenshots
- `npm-install.png` - npm install progress

## How to Add Screenshots

1. Take screenshots at consistent resolutions (800x600 or 1280x720)
2. Save as PNG for UI elements or JPG for photos
3. Use descriptive filenames (lowercase, hyphen-separated)
4. Compress images to keep file sizes under 500KB
5. Add them to this directory
6. Reference with: `/content/screenshots/filename.png`

## Image Optimization

Before adding screenshots, optimize them:

```bash
# Using ImageMagick
convert input.png -resize 1280x720 -quality 85 output.png

# Using pngquant
pngquant --quality=70-85 input.png -o output.png
```
