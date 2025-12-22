# Content Management Guide

This project site uses JSON files for all content, making it easy to update text, features, documentation, and tutorials without touching the code.

## Content Structure

All content files are located in `/public/content/` directory:

- **navigation.json** - Site navigation, routes, and external links
- **home.json** - Homepage content (hero, features, pitch)
- **docs.json** - Documentation sections (legacy, use docs/ directory for new content)
- **api.json** - API reference modules (legacy, use api/ directory for new content)
- **tutorials.json** - Tutorial pages (legacy, use tutorials/ directory for new content)

### New Modular Structure

For easier maintenance, content is now organized into subdirectories:

- **docs/** - Individual documentation files (getting-started.json, editor-guide.json, etc.)
- **api/** - Individual API module files (engine.json, world.json, network.json, etc.)
- **tutorials/** - Individual tutorial files (00-editor-basics.json, 01-mesh-designer.json, etc.)

## Editing Content

### 1. Navigation and Routes

Edit `/public/content/navigation.json` to:
- Change brand name and tagline
- Add/remove navigation menu items
- Update external links (e.g., GitHub)

```json
{
  "brand": {
    "name": "Nostalgi2D",
    "tagline": "TypeScript-first 2D Game Engine"
  },
  "routes": [
    {
      "id": "home",
      "label": "Home",
      "icon": "Rocket",
      "contentFile": "home.json"
    }
  ]
}
```

Available icons: `Rocket`, `Cpu`, `Network`, `BookText`, `Code2`, `TerminalSquare`, `Github`

### 2. Homepage Content

Edit `/public/content/home.json`:

**Hero Section:**
```json
{
  "hero": {
    "title": "Your hero title",
    "subtitle": "Your subtitle text",
    "cta": [
      {
        "label": "Button text",
        "icon": "Rocket",
        "action": "navigate",
        "target": "docs",
        "style": "primary"
      }
    ]
  }
}
```

**Features:**
```json
{
  "features": [
    {
      "title": "Feature Name",
      "description": "Feature description",
      "icon": "Cpu",
      "color": "#08f7fe"
    }
  ]
}
```

**Pitch Section:**
```json
{
  "pitch": {
    "title": "Why Your Product?",
    "columns": [
      ["Benefit 1", "Benefit 2"],
      ["Benefit 3", "Benefit 4"]
    ]
  }
}
```

### 3. Documentation

Edit `/public/content/docs.json`:

```json
{
  "title": "Documentation",
  "sections": [
    {
      "id": "intro",
      "title": "Introduction",
      "summary": "Brief summary",
      "content": [
        {
          "type": "paragraph",
          "text": "Your paragraph text"
        },
        {
          "type": "heading",
          "level": 3,
          "text": "Section heading"
        },
        {
          "type": "list",
          "items": ["Item 1", "Item 2"]
        },
        {
          "type": "code",
          "language": "bash",
          "code": "npm install"
        }
      ]
    }
  ]
}
```

Content block types:
- `paragraph` - Regular text paragraph
- `heading` - Heading (level 3, 4, or 5)
- `list` - Bulleted list
- `code` - Code block with syntax highlighting
- `image` - Image with optional caption
- `note` - Informational callout box (cyan theme)
- `warning` - Warning callout box (yellow theme)

### 4. API Reference

#### Legacy Format (api.json)

Edit `/public/content/api.json` for simple API overviews.

#### New Modular Format (api/ directory)

Create individual files in `/public/content/api/` for detailed API documentation:

```json
{
  "name": "ModuleName",
  "description": "What it does",
  "color": "#08f7fe",
  "example": "import { ModuleName } from '@pkg';\n\nconst m = new ModuleName();",
  "properties": [
    {
      "name": "propertyName",
      "type": "string",
      "description": "What it represents",
      "readonly": true
    }
  ],
  "methods": [
    {
      "name": "methodName",
      "description": "What it does",
      "signature": "methodName(param: Type): ReturnType",
      "parameters": [
        {
          "name": "param",
          "type": "Type",
          "description": "Parameter description",
          "optional": false
        }
      ],
      "returns": "ReturnType - Description of return value",
      "example": "const result = module.methodName(value);"
    }
  ]
}
```

### 5. Tutorials

#### Legacy Format (tutorials.json)

Edit `/public/content/tutorials.json` for simple tutorial lists.

#### New Detailed Format (tutorials/ directory)

Create individual files in `/public/content/tutorials/` for comprehensive tutorials with screenshots and detailed content:

```json
{
  "title": "01 • Tutorial Name",
  "summary": "Brief description",
  "color": "#08f7fe",
  "difficulty": "beginner",
  "duration": "30 minutes",
  "content": [
    {
      "type": "paragraph",
      "text": "Introduction paragraph"
    },
    {
      "type": "heading",
      "level": 3,
      "text": "Section Title"
    },
    {
      "type": "code",
      "language": "typescript",
      "code": "const example = 'code';"
    },
    {
      "type": "image",
      "src": "/content/screenshots/example.png",
      "alt": "Description of image",
      "caption": "Image caption"
    },
    {
      "type": "note",
      "text": "💡 Helpful tip or information"
    },
    {
      "type": "warning",
      "text": "⚠️ Important warning or caution"
    }
  ]
}
```

## Color Palette

Use these colors for consistency:
- Cyan: `#08f7fe`
- Magenta: `#fe53bb`
- Purple: `#9d4edd`

## Development

After editing JSON files:

1. **Preview changes:**
   ```bash
   npm run dev
   ```
   Open http://localhost:5173

2. **Build for production:**
   ```bash
   npm run build
   ```

3. **Deploy:**
   ```bash
   npm run deploy
   ```

## Tips

- Keep text concise and scannable
- Use consistent formatting across sections
- Test color combinations for readability
- Validate JSON syntax before committing (use a JSON validator)
- Keep the same structure when adding new items

## Adding Screenshots and Images

Images should be placed in `/public/content/screenshots/` directory. Reference them in JSON using:

```json
{
  "type": "image",
  "src": "/content/screenshots/your-image.png",
  "alt": "Descriptive alt text for accessibility",
  "caption": "Optional caption displayed below the image"
}
```

Supported image formats: PNG, JPG, GIF, WebP

### Best Practices for Screenshots

- Use consistent window sizes (800x600 or 1280x720)
- Highlight important UI elements with colored boxes or arrows
- Include cursor in screenshots when showing interactions
- Save in PNG format for crisp UI elements
- Compress images to keep file sizes reasonable (<500KB per image)
- Use descriptive filenames (e.g., `vscode-mesh-designer.png`)

## Troubleshooting

If content doesn't appear:
1. Check JSON syntax is valid (no trailing commas, proper quotes)
2. Ensure file is in correct directory (`/public/content/`, `/public/content/docs/`, etc.)
3. Verify image paths start with `/content/` not `/public/content/`
4. Clear browser cache and refresh
5. Check browser console for errors
6. Validate JSON with an online validator
