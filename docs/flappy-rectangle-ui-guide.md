# Flappy Rectangle UI Integration

This guide shows how to integrate the Flappy Rectangle score UI components into your game.

## Components

Three React components are available:

1. **FlappyRectangleScoreUI** - Displays current score and high score
2. **FlappyRectangleGameOverUI** - Shows game over screen with final score
3. **FlappyRectangleStartUI** - Shows a start gate overlay and emits the start request when the button is pressed

## Events

Use the shared keys from `FLAPPY_UI_EVENTS` in `@repo/example/flappyEvents` to avoid typos and keep UI and gameplay in sync.

| Direction | Event key | Payload | When it fires |
|-----------|-----------|---------|---------------|
| Game → UI | `FLAPPY_UI_EVENTS.score` | number | Score increments after passing a gap detector |
| Game → UI | `FLAPPY_UI_EVENTS.highScore` | number | New best score achieved |
| Game → UI | `FLAPPY_UI_EVENTS.lastScore` | number | Score from the previous round (emitted on crash) |
| Game → UI | `FLAPPY_UI_EVENTS.finalScore` | number | Final score when the player crashes |
| Game → UI | `FLAPPY_UI_EVENTS.gameOver` | boolean | `true` when the run ends, `false` when reset/restarted |
| Game → UI | `FLAPPY_UI_EVENTS.waitingStart` | boolean | `true` when input should be blocked and the start overlay shown |
| UI → Game | `FLAPPY_UI_EVENTS.startRequest` | void | Start button pressed in the start overlay |

## Quick Integration

### Option 1: Using Component Registry (Recommended)

Register components when the game mode starts:

```typescript
import { FlappyRectangleScoreUI, FlappyRectangleGameOverUI } from "@repo/example";

// During game initialization or in GameMode.onGameStart()
engine.componentRegistry.register({
    id: 'flappy-score',
    component: FlappyRectangleScoreUI,
    visible: true,
    zIndex: 100
});

engine.componentRegistry.register({
    id: 'flappy-gameover',
    component: FlappyRectangleGameOverUI,
    visible: true,
    zIndex: 200
});
```

Then in your React app:

```tsx
import { GUIProvider, GUIRenderer } from "@repo/engine";

function App() {
    return (
        <GUIProvider guiManager={guiManager} componentRegistry={componentRegistry}>
            <div className="game-container">
                <canvas id="game-canvas" />
                <div className="ui-overlay">
                    <GUIRenderer />
                </div>
            </div>
        </GUIProvider>
    );
}
```

### Option 2: Direct Component Usage

If you prefer to render the components directly:

```tsx
import { GUIProvider } from "@repo/engine";
import { FlappyRectangleScoreUI, FlappyRectangleGameOverUI } from "@repo/example";

function FlappyRectangleUI() {
    return (
        <GUIProvider guiManager={guiManager} componentRegistry={componentRegistry}>
            <div className="game-container">
                <canvas id="game-canvas" />
                <div className="ui-overlay">
                    <FlappyRectangleScoreUI />
                    <FlappyRectangleGameOverUI />
                </div>
            </div>
        </GUIProvider>
    );
}
```

## Component Features

### FlappyRectangleScoreUI

- Large, centered score display at the top of the screen
- Shows current score in bold white text
- Displays high score in gold color (only when high score > 0)
- Styled with text shadows for readability over the game
- Non-interactive (pointer-events: none)

### FlappyRectangleGameOverUI

- Full-screen overlay with semi-transparent background
- Centered game over dialog box
- Shows "GAME OVER" title
- Displays final score prominently
- "Restarting..." message with pulsing animation
- Fade-in animation when displayed
- Only visible when `flappy:gameOver` event is true

## Customization

You can customize the appearance by:

1. **Modifying styles inline** - Edit the component files directly
2. **Adding CSS classes** - Replace inline styles with CSS classes
3. **Creating variants** - Copy the components and create your own versions

Example of style customization:

```tsx
// Create a custom score component with different styling
export function CustomFlappyScoreUI() {
    const guiManager = useGUIManager();
    const score = useGUIState(guiManager, 'flappy:score', 0);

    return (
        <div className="my-custom-score">
            Score: {score}
        </div>
    );
}
```

## Advanced: Adding Sound Effects

You can use `useGUIEvent` to trigger sound effects when score changes:

```tsx
import { useGUIManager, useGUIEvent } from "@repo/engine";

export function FlappyRectangleSoundManager() {
    const guiManager = useGUIManager();

    useGUIEvent(guiManager, 'flappy:score', (newScore: number) => {
        // Play score sound
        playSound('score-beep.mp3');
    });

    useGUIEvent(guiManager, 'flappy:gameOver', (isGameOver: boolean) => {
        if (isGameOver) {
            // Play game over sound
            playSound('game-over.mp3');
        }
    });

    return null; // This component doesn't render anything
}
```

## Testing

The game mode automatically:
- Resets score to 0 on game start
- Increments score when player passes through a gap
- Shows game over screen when player crashes
- Tracks and displays high score across restarts
- Automatically restarts the game after crash

All events are emitted through the `GUIManager`, so your UI components will automatically update.
