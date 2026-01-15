# React UI System Guide

This guide explains how to use the React-based UI system with your game engine.

## Overview

The UI system provides:
- **GUIManager**: Event emitter for communication between game code and React components
- **GUIComponentRegistry**: Dynamic registration and management of UI components
- **React Hooks**: Easy integration with React components
- **Provider/Context**: Global access to GUI system throughout your React app

## Architecture

```
Game Engine (TypeScript)
    ↓ emit events
GUIManager
    ↓ React hooks
React Components
    ↓ render
Game UI
```

## Setup

### 1. Create instances in your engine initialization

```typescript
// In your engine setup or main game file
import { Engine } from "@repo/engine";
import { GUIManager, GUIComponentRegistry } from "@repo/engine";

const engine = new Engine();
const guiManager = new GUIManager();
const componentRegistry = new GUIComponentRegistry();

// Make guiManager accessible to your game code
engine.guiManager = guiManager;
engine.componentRegistry = componentRegistry;
```

### 2. Wrap your React app with GUIProvider

```tsx
import { GUIProvider, GUIRenderer } from "@repo/engine";
import { createRoot } from "react-dom/client";

function GameUI() {
    return (
        <GUIProvider 
            guiManager={guiManager} 
            componentRegistry={componentRegistry}
        >
            <div className="game-container">
                {/* Your game canvas */}
                <canvas id="game-canvas" />
                
                {/* UI overlay - renders all registered components */}
                <div className="ui-overlay">
                    <GUIRenderer />
                </div>
            </div>
        </GUIProvider>
    );
}

const root = createRoot(document.getElementById("root")!);
root.render(<GameUI />);
```

## Emitting Events from Game Code

### From an Actor

```typescript
import { Actor } from "@repo/engine";

export class Player extends Actor {
    private health: number = 100;
    
    public takeDamage(amount: number): void {
        this.health -= amount;
        
        // Emit event to update UI
        this.world.engine.guiManager.emit('player:health', this.health);
        
        if (this.health <= 0) {
            this.world.engine.guiManager.emit('player:died');
        }
    }
    
    public addItem(item: string): void {
        this.inventory.push(item);
        this.world.engine.guiManager.emit('player:inventory', this.inventory);
    }
}
```

### From a GameMode

```typescript
import { GameMode } from "@repo/engine";

export class MyGameMode extends GameMode {
    private score: number = 0;
    
    public addScore(points: number): void {
        this.score += points;
        this.engine.guiManager.emit('game:score', this.score);
    }
    
    public showMessage(message: string): void {
        this.engine.guiManager.emit('game:message', message);
        
        // Clear message after 3 seconds
        setTimeout(() => {
            this.engine.guiManager.emit('game:message', '');
        }, 3000);
    }
    
    public onGameStart(): void {
        this.engine.guiManager.emit('game:started');
        this.engine.guiManager.emit('game:score', this.score);
    }
}
```

### From a Controller

```typescript
import { Controller } from "@repo/engine";

export class PlayerController extends Controller {
    
    public onPossess(pawn: Pawn): void {
        super.onPossess(pawn);
        this.world.engine.guiManager.emit('player:possessed', pawn);
    }
    
    public performAction(actionName: string): void {
        // Emit action feedback to UI
        this.world.engine.guiManager.emit('player:action', actionName);
    }
}
```

## Creating React UI Components

### Example 1: Simple State Display

```tsx
import { useGUIManager } from "@repo/engine";
import { useGUIState } from "@repo/engine";

export function PlayerHealthBar() {
    const guiManager = useGUIManager();
    const health = useGUIState(guiManager, 'player:health', 100);
    
    return (
        <div className="health-bar">
            <div className="health-fill" style={{ width: `${health}%` }} />
            <span>{health} HP</span>
        </div>
    );
}
```

### Example 2: Interactive Component (UI to Game)

```tsx
import { useGUIManager, useGUIEmitter } from "@repo/engine";

export function PauseMenu() {
    const guiManager = useGUIManager();
    const emitResume = useGUIEmitter(guiManager, 'ui:resume');
    const emitMainMenu = useGUIEmitter(guiManager, 'ui:mainMenu');
    
    return (
        <div className="pause-menu">
            <h2>Paused</h2>
            <button onClick={() => emitResume()}>Resume</button>
            <button onClick={() => emitMainMenu()}>Main Menu</button>
        </div>
    );
}

// In your game code, listen to these events:
engine.guiManager.on('ui:resume', () => {
    engine.resume();
});

engine.guiManager.on('ui:mainMenu', () => {
    engine.loadMainMenu();
});
```

### Example 3: Complex Component with Multiple Events

```tsx
import { useGUIManager, useGUIState, useGUIEmitter, useGUIEvent } from "@repo/engine";
import { useState } from "react";

export function InventoryPanel() {
    const guiManager = useGUIManager();
    const items = useGUIState<Item[]>(guiManager, 'player:inventory', []);
    const [selectedItem, setSelectedItem] = useState<Item | null>(null);
    
    const emitUseItem = useGUIEmitter(guiManager, 'ui:useItem');
    const emitDropItem = useGUIEmitter(guiManager, 'ui:dropItem');
    
    // Listen for item pickup notification
    useGUIEvent(guiManager, 'player:itemPickedUp', (itemName: string) => {
        console.log(`Picked up: ${itemName}`);
    });
    
    return (
        <div className="inventory-panel">
            <h3>Inventory</h3>
            <div className="item-grid">
                {items.map((item) => (
                    <div 
                        key={item.id}
                        className="item-slot"
                        onClick={() => setSelectedItem(item)}
                    >
                        <img src={item.icon} alt={item.name} />
                    </div>
                ))}
            </div>
            {selectedItem && (
                <div className="item-actions">
                    <button onClick={() => emitUseItem(selectedItem.id)}>
                        Use
                    </button>
                    <button onClick={() => emitDropItem(selectedItem.id)}>
                        Drop
                    </button>
                </div>
            )}
        </div>
    );
}
```

## Registering Components Dynamically

You can register components to be shown/hidden based on game state:

### From Game Code

```typescript
import { PlayerHealthUI, InventoryUI } from "./ui/components";

// During game initialization
componentRegistry.register({
    id: 'player-health',
    component: PlayerHealthUI,
    zIndex: 100,
    visible: true
});

componentRegistry.register({
    id: 'inventory',
    component: InventoryUI,
    zIndex: 50,
    visible: false // Hidden by default
});

// Show/hide based on game state
engine.guiManager.on('ui:toggleInventory', () => {
    const current = componentRegistry.get('inventory');
    if (current) {
        componentRegistry.setVisible('inventory', !current.visible);
    }
});

// Update component props dynamically
componentRegistry.updateProps('player-health', { 
    style: { backgroundColor: 'red' } 
});
```

### From a GameMode

```typescript
export class MainGameMode extends GameMode {
    
    public onGameStart(): void {
        // Register game-specific UI
        this.engine.componentRegistry.register({
            id: 'game-hud',
            component: GameHUD,
            visible: true,
            zIndex: 10
        });
        
        this.engine.componentRegistry.register({
            id: 'minimap',
            component: Minimap,
            props: { size: 200 },
            visible: true,
            zIndex: 5
        });
    }
    
    public onStop(): void {
        // Clean up UI when game mode ends
        this.engine.componentRegistry.unregister('game-hud');
        this.engine.componentRegistry.unregister('minimap');
    }
}
```

## Event Naming Conventions

Follow these conventions for clarity:

- `player:*` - Events related to the player (health, inventory, position, etc.)
- `game:*` - Events related to game state (score, level, game over, etc.)
- `ui:*` - Events from UI to game (button clicks, menu actions, etc.)
- `enemy:*` - Events related to enemies
- `world:*` - Events related to world/level changes

Examples:
```typescript
// Good
guiManager.emit('player:health', 100);
guiManager.emit('game:score', 1000);
guiManager.emit('ui:pauseGame');
guiManager.emit('enemy:spawned', enemyType);

// Less clear
guiManager.emit('updateHealth', 100);
guiManager.emit('scoreChanged', 1000);
```

## Best Practices

### 1. Cleanup Event Listeners

The hooks handle cleanup automatically, but if you manually use `guiManager.on()`, always clean up:

```typescript
// In a React component
useEffect(() => {
    const handler = (data) => console.log(data);
    guiManager.on('some:event', handler);
    
    return () => {
        guiManager.off('some:event', handler);
    };
}, [guiManager]);
```

### 2. Type Safety

Define event types for better type safety:

```typescript
// types/guiEvents.ts
export interface GUIEvents {
    'player:health': (health: number, maxHealth: number) => void;
    'player:inventory': (items: Item[]) => void;
    'game:score': (score: number) => void;
    'ui:useItem': (itemId: string) => void;
}

// Use with hooks
const health = useGUIState<number>(guiManager, 'player:health', 100);
const emitUseItem = useGUIEmitter<[string]>(guiManager, 'ui:useItem');
```

### 3. Component Lifecycle

Register components when they're needed and unregister when done:

```typescript
// Good - clean up when game mode ends
public onStop(): void {
    this.engine.componentRegistry.clear();
}

// Good - register only active UI
if (gameState === 'playing') {
    componentRegistry.register({ id: 'hud', component: GameHUD });
} else {
    componentRegistry.unregister('hud');
}
```

### 4. Performance

Avoid emitting events every frame if possible:

```typescript
// Bad - emits every frame
public tick(deltaTime: number): void {
    this.engine.guiManager.emit('player:position', this.position);
}

// Good - emit only when changed significantly
public tick(deltaTime: number): void {
    if (this.position.distanceTo(this.lastEmittedPosition) > 1) {
        this.engine.guiManager.emit('player:position', this.position);
        this.lastEmittedPosition = this.position.clone();
    }
}
```

## Complete Example

Here's a full example putting it all together:

```typescript
// game/myGame.ts
import { Engine, GUIManager, GUIComponentRegistry } from "@repo/engine";

export class MyGame {
    private engine: Engine;
    private guiManager: GUIManager;
    private componentRegistry: GUIComponentRegistry;
    
    constructor() {
        this.engine = new Engine();
        this.guiManager = new GUIManager();
        this.componentRegistry = new GUIComponentRegistry();
        
        // Make accessible
        (this.engine as any).guiManager = this.guiManager;
        (this.engine as any).componentRegistry = this.componentRegistry;
        
        this.setupUIListeners();
    }
    
    private setupUIListeners(): void {
        // Listen to UI events
        this.guiManager.on('ui:pauseGame', () => {
            this.engine.pause();
        });
        
        this.guiManager.on('ui:useItem', (itemId: string) => {
            const player = this.engine.world.getPlayerPawn();
            player?.useItem(itemId);
        });
    }
    
    public start(): void {
        this.engine.start();
        
        // Register initial UI components
        this.componentRegistry.register({
            id: 'player-hud',
            component: PlayerHUD,
            visible: true,
            zIndex: 100
        });
    }
}
```

```tsx
// ui/App.tsx
import { GUIProvider, GUIRenderer } from "@repo/engine";
import { myGame } from "./game/myGame";

export function App() {
    return (
        <GUIProvider 
            guiManager={myGame.guiManager}
            componentRegistry={myGame.componentRegistry}
        >
            <div className="game-app">
                <canvas id="game-canvas" />
                <div className="ui-layer">
                    <GUIRenderer />
                </div>
            </div>
        </GUIProvider>
    );
}
```

```tsx
// ui/components/PlayerHUD.tsx
import { useGUIManager, useGUIState, useGUIEmitter } from "@repo/engine";

export function PlayerHUD() {
    const guiManager = useGUIManager();
    const health = useGUIState(guiManager, 'player:health', 100);
    const score = useGUIState(guiManager, 'game:score', 0);
    const emitPause = useGUIEmitter(guiManager, 'ui:pauseGame');
    
    return (
        <div className="player-hud">
            <div className="health">HP: {health}</div>
            <div className="score">Score: {score}</div>
            <button onClick={() => emitPause()}>Pause</button>
        </div>
    );
}
```

This system provides a clean separation between your game engine and UI, making it easy to create reactive, event-driven UI components that respond to game state changes.
