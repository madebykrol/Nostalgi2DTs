# Nostalgi2D Project Site Content

## Overview

The project site content has been restructured for better maintainability and extensibility. Content is now organized into modular JSON files that can be easily edited without touching code.

## Directory Structure

```
public/content/
├── api/                    # API documentation (modular)
│   ├── engine.json
│   ├── world.json
│   ├── network.json
│   ├── renderer.json
│   └── input.json
├── docs/                   # Documentation pages (modular)
│   ├── getting-started.json
│   ├── editor-guide.json
│   └── networking.json
├── tutorials/              # Tutorial content (modular)
│   ├── 00-editor-basics.json
│   ├── 01-mesh-designer.json
│   ├── 02-hello-world.json
│   ├── 03-input-physics.json
│   └── 04-editor-plugins.json
├── screenshots/            # Images for tutorials/docs
│   └── README.md
├── api.json               # Legacy API overview
├── docs.json              # Legacy docs structure
├── tutorials.json         # Legacy tutorial list
├── home.json              # Homepage content
└── navigation.json        # Site navigation
```

## Content Features

### Enhanced Content Blocks

All content files support these block types:

- **paragraph** - Regular text
- **heading** - Headings (levels 3-5)
- **list** - Bulleted lists
- **code** - Syntax-highlighted code blocks
- **image** - Images with captions
- **note** - Info callouts (cyan theme)
- **warning** - Warning callouts (yellow theme)

### Tutorial Enhancements

Tutorials now include:
- Difficulty level (beginner/intermediate/advanced)
- Time estimates
- Detailed step-by-step content
- Code examples with syntax highlighting
- Screenshot placeholders
- Tips and warnings

### API Documentation

API docs now include:
- Method signatures
- Parameter descriptions
- Return value documentation
- Usage examples
- Properties with types

## Adding New Content

### New Tutorial

1. Create a file in `tutorials/` (e.g., `05-new-tutorial.json`)
2. Use the tutorial template (see existing files)
3. Add screenshots to `screenshots/` directory
4. Reference screenshots with `/content/screenshots/filename.png`

### New API Documentation

1. Create a file in `api/` (e.g., `physics.json`)
2. Include properties and methods with examples
3. Use TypeScript syntax for signatures

### New Documentation Page

1. Create a file in `docs/` (e.g., `advanced-topics.json`)
2. Organize content with headings and sections
3. Include code examples and images

## Content Guidelines

### Writing Style

- Use clear, concise language
- Write in second person ("you can", "your game")
- Include practical examples
- Add tips and warnings where appropriate

### Code Examples

- Keep examples short and focused
- Include comments for clarity
- Show complete working code when possible
- Use TypeScript syntax

### Images

- Save screenshots as PNG for UI elements
- Use consistent resolution (1280x720 recommended)
- Compress images (<500KB per file)
- Add descriptive alt text for accessibility
- Include captions to explain what's shown

## Testing Changes

After editing content:

```bash
cd src/apps/projectsite
npm run dev
```

Visit http://localhost:5173 to preview changes.

## Building for Production

```bash
npm run build
```

The build will validate all JSON and compile the site.

## Future Improvements

- [ ] Implement content loader for subdirectories
- [ ] Add search functionality across all content
- [ ] Create content versioning system
- [ ] Add interactive code playgrounds
- [ ] Generate table of contents automatically
- [ ] Add prev/next navigation between tutorials

## Contributing

When adding content:
1. Follow the existing structure and naming conventions
2. Validate JSON syntax before committing
3. Test in development mode
4. Add appropriate screenshots
5. Update this README if adding new features

For questions, see CONTENT_GUIDE.md or reach out to the team.
