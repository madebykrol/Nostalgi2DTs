import { useGUIManager, useGUIState, useGUIEmitter } from "@repo/engine";

/**
 * Example: Player Health UI Component
 * Listens to 'player:health' events from the game
 */
export function PlayerHealthUI() {
    const guiManager = useGUIManager();
    const health = useGUIState(guiManager, 'player:health', 100);
    const maxHealth = useGUIState(guiManager, 'player:maxHealth', 100);

    const healthPercentage = (health / maxHealth) * 100;

    return (
        <div style={{ 
            position: 'absolute', 
            top: 20, 
            left: 20,
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            padding: '10px',
            borderRadius: '5px',
            color: 'white'
        }}>
            <div style={{ marginBottom: '5px' }}>Health: {health} / {maxHealth}</div>
            <div style={{ 
                width: '200px', 
                height: '20px', 
                backgroundColor: '#333',
                borderRadius: '3px',
                overflow: 'hidden'
            }}>
                <div style={{
                    width: `${healthPercentage}%`,
                    height: '100%',
                    backgroundColor: healthPercentage > 50 ? '#4CAF50' : healthPercentage > 25 ? '#FFC107' : '#F44336',
                    transition: 'width 0.3s ease'
                }} />
            </div>
        </div>
    );
}

/**
 * Example: Inventory UI Component
 * Displays items and allows interaction
 */
export function InventoryUI() {
    const guiManager = useGUIManager();
    const items = useGUIState<string[]>(guiManager, 'player:inventory', []);
    const emitUseItem = useGUIEmitter(guiManager, 'ui:useItem');

    return (
        <div style={{
            position: 'absolute',
            top: 20,
            right: 20,
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            padding: '10px',
            borderRadius: '5px',
            color: 'white',
            minWidth: '150px'
        }}>
            <h3 style={{ margin: '0 0 10px 0' }}>Inventory</h3>
            {items.length === 0 ? (
                <div style={{ color: '#888' }}>Empty</div>
            ) : (
                <div>
                    {items.map((item, index) => (
                        <div 
                            key={index}
                            style={{
                                padding: '5px',
                                marginBottom: '5px',
                                backgroundColor: 'rgba(255, 255, 255, 0.1)',
                                borderRadius: '3px',
                                cursor: 'pointer'
                            }}
                            onClick={() => emitUseItem(item)}
                        >
                            {item}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

/**
 * Example: Game Message UI Component
 * Shows temporary messages from the game
 */
export function GameMessageUI() {
    const guiManager = useGUIManager();
    const message = useGUIState<string>(guiManager, 'game:message', '');

    if (!message) return null;

    return (
        <div style={{
            position: 'absolute',
            bottom: 100,
            left: '50%',
            transform: 'translateX(-50%)',
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            padding: '15px 30px',
            borderRadius: '5px',
            color: 'white',
            fontSize: '18px',
            animation: 'fadeIn 0.3s ease'
        }}>
            {message}
        </div>
    );
}

/**
 * Example: Score/Stats UI Component
 */
export function ScoreUI() {
    const guiManager = useGUIManager();
    const score = useGUIState(guiManager, 'game:score', 0);
    const level = useGUIState(guiManager, 'game:level', 1);

    return (
        <div style={{
            position: 'absolute',
            top: 20,
            left: '50%',
            transform: 'translateX(-50%)',
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            padding: '10px 20px',
            borderRadius: '5px',
            color: 'white',
            textAlign: 'center'
        }}>
            <div style={{ fontSize: '24px', fontWeight: 'bold' }}>{score}</div>
            <div style={{ fontSize: '12px', color: '#aaa' }}>Level {level}</div>
        </div>
    );
}
