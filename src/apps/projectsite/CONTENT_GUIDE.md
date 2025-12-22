# Content Management Guide

This project site uses JSON files for all content, making it easy to update text, features, documentation, and tutorials without touching the code.

## Content Structure

All content files are located in `/public/content/` directory:

- **navigation.json** - Site navigation, routes, and external links
- **home.json** - Homepage content (hero, features, pitch)
- **docs.json** - Documentation sections and content
- **api.json** - API reference modules
- **tutorials.json** - Tutorial pages

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
- `code` - Code block with syntax

### 4. API Reference

Edit `/public/content/api.json`:

```json
{
  "title": "API Reference",
  "subtitle": "Description",
  "modules": [
    {
      "name": "ModuleName",
      "description": "What it does",
      "color": "#08f7fe",
      "example": "import { ModuleName } from '@pkg';\n\nconst m = new ModuleName();"
    }
  ]
}
```

### 5. Tutorials

Edit `/public/content/tutorials.json`:

```json
{
  "title": "Tutorials",
  "subtitle": "Description",
  "tutorials": [
    {
      "title": "01 • Tutorial Name",
      "summary": "Brief description",
      "color": "#08f7fe",
      "steps": [
        "Step 1",
        "Step 2"
      ]
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

## Troubleshooting

If content doesn't appear:
1. Check JSON syntax is valid (no trailing commas, proper quotes)
2. Ensure file is in `/public/content/` directory
3. Clear browser cache and refresh
4. Check browser console for errors
