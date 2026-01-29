import { useGUIManager, useGUIState, useGUIEmitter } from "@nostalgi2d/engine";
import { FLAPPY_UI_EVENTS } from "../flappyEvents";
import React, { ChangeEvent } from "react";

/**
 * Score display component for the Flappy Rectangle game
 * Shows the current score with a clean, game-style appearance
 */
export function FlappyRectangleScoreUI() {
    const guiManager = useGUIManager();
    const score = useGUIState(guiManager, FLAPPY_UI_EVENTS.score, 0);
    const highScore = useGUIState(guiManager, FLAPPY_UI_EVENTS.highScore, 0);
    const lastScore = useGUIState(guiManager, FLAPPY_UI_EVENTS.lastScore, 0);

    return (
        <div style={{
            position: 'absolute',
            top: '40px',
            left: '50%',
            transform: 'translateX(-50%)',
            textAlign: 'center',
            fontFamily: 'monospace, sans-serif',
            userSelect: 'none',
            pointerEvents: 'none',
            zIndex: 1000
        }}>
            {/* Current Score */}
            <div style={{
                fontSize: '72px',
                fontWeight: 'bold',
                color: '#fff',
                textShadow: '4px 4px 8px rgba(0, 0, 0, 0.8), 0 0 20px rgba(255, 255, 255, 0.3)',
                letterSpacing: '4px',
                marginBottom: '10px'
            }}>
                {score}
            </div>

            {/* High Score */}
            {highScore > 0 && (
                <div style={{
                    fontSize: '18px',
                    color: '#ffd700',
                    textShadow: '2px 2px 4px rgba(0, 0, 0, 0.8)',
                    letterSpacing: '2px'
                }}>
                    BEST: {highScore} Last {lastScore}
                </div>
            )}
        </div>
    );
}

/**
 * Game Over screen component for Flappy Rectangle
 * Shows final score and instructions to restart
 */
export function FlappyRectangleGameOverUI() {
    const guiManager = useGUIManager();
    const isGameOver = useGUIState(guiManager, FLAPPY_UI_EVENTS.gameOver, false);
    const finalScore = useGUIState(guiManager, FLAPPY_UI_EVENTS.finalScore, 0);
    const emitStart = useGUIEmitter(guiManager, FLAPPY_UI_EVENTS.restartRequest);

    if (!isGameOver) return null;

    return (
        <div style={{
            position: 'absolute',
            top: '0',
            left: '0',
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            zIndex: 2000,
            animation: 'fadeIn 0.3s ease-in'
        }}>
            <div style={{
                backgroundColor: 'rgba(20, 20, 20, 0.95)',
                padding: '40px 60px',
                borderRadius: '15px',
                border: '3px solid #ffd700',
                textAlign: 'center',
                boxShadow: '0 10px 40px rgba(0, 0, 0, 0.8)'
            }}>
                <h1 style={{
                    fontSize: '48px',
                    color: '#ff4444',
                    margin: '0 0 20px 0',
                    fontFamily: 'monospace, sans-serif',
                    textShadow: '3px 3px 6px rgba(0, 0, 0, 0.8)'
                }}>
                    GAME OVER
                </h1>

                <div style={{
                    fontSize: '24px',
                    color: '#fff',
                    marginBottom: '10px',
                    fontFamily: 'monospace, sans-serif'
                }}>
                    Final Score 
                </div>

                <div style={{
                    fontSize: '64px',
                    color: '#ffd700',
                    fontWeight: 'bold',
                    marginBottom: '30px',
                    fontFamily: 'monospace, sans-serif',
                    textShadow: '3px 3px 6px rgba(0, 0, 0, 0.8)'
                }}>
                    {finalScore}
                </div>

                <div style={{
                    fontSize: '18px',
                    color: '#aaa',
                    fontFamily: 'monospace, sans-serif',
                    animation: 'pulse 2s infinite'
                }}>
                <button
                    style={{
                        background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '10px',
                        padding: '12px 22px',
                        fontSize: '16px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        letterSpacing: '1px',
                        boxShadow: '0 8px 20px rgba(22, 163, 74, 0.35)',
                        transition: 'transform 120ms ease, box-shadow 120ms ease'
                    }}
                    onClick={() => {
                        console.log("Restarting game...");
                        emitStart()}}
                    onMouseDown={(e) => (e.currentTarget.style.transform = 'translateY(1px)')}
                    onMouseUp={(e) => (e.currentTarget.style.transform = 'translateY(0)')}
                >
                    RESTART GAME
                </button>
                </div>
            </div>

            <style>{`
                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                @keyframes pulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.5; }
                }
            `}</style>
        </div>
    );
}

/**
 * Start screen for Flappy Rectangle
 * Shows a start button; blocks game logic until pressed
 */
export function FlappyRectangleStartUI() {
    const guiManager = useGUIManager();
    const waitingStart = useGUIState(guiManager, FLAPPY_UI_EVENTS.waitingStart, true);
    const emitStart = useGUIEmitter(guiManager, FLAPPY_UI_EVENTS.startRequest);
    const useIndicatorsEmitter = useGUIEmitter(guiManager, FLAPPY_UI_EVENTS.useIndicators);

    const [useIndicators, setUseIndicators] = React.useState(false);

    if (!waitingStart) return null;

    return (
        <div style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(0, 0, 0, 0.55)',
            zIndex: 2500,
            pointerEvents: 'auto'
        }}>
            <div style={{
                backgroundColor: 'rgba(15, 15, 20, 0.95)',
                padding: '28px 36px',
                borderRadius: '12px',
                border: '2px solid #4ade80',
                boxShadow: '0 12px 40px rgba(0,0,0,0.6)',
                textAlign: 'center',
                fontFamily: 'monospace, sans-serif',
                color: '#e5e7eb',
                minWidth: '320px'
            }}>
                <div style={{
                    fontSize: '20px',
                    letterSpacing: '2px',
                    color: '#a5f3fc',
                    marginBottom: '16px'
                }}>
                    FLAPPY RECTANGLE
                </div>
                <div style={{
                    fontSize: '14px',
                    color: '#cbd5e1',
                    marginBottom: '18px'
                }}>
                    Press start to begin.
                    Press spacebar or tap the screen to flap
                    <br />
                    Use indicator (Chicken mode): <input type="checkbox" checked={useIndicators} onChange={(event: ChangeEvent<HTMLInputElement>) => {

                        const shouldUseIndicators = event.target.checked;
                        useIndicatorsEmitter(shouldUseIndicators!)
                        setUseIndicators(shouldUseIndicators);
                        }} />
                </div>
                <button
                    style={{
                        background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '10px',
                        padding: '12px 22px',
                        fontSize: '16px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        letterSpacing: '1px',
                        boxShadow: '0 8px 20px rgba(22, 163, 74, 0.35)',
                        transition: 'transform 120ms ease, box-shadow 120ms ease'
                    }}
                    onClick={() => emitStart()}
                    onMouseDown={(e) => (e.currentTarget.style.transform = 'translateY(1px)')}
                    onMouseUp={(e) => (e.currentTarget.style.transform = 'translateY(0)')}
                >
                    START GAME
                </button>
            </div>
        </div>
    );
}

/**
 * In-game flap button for touch/mouse input
 */
export function FlappyRectangleFlapButton() {
    const guiManager = useGUIManager();
    const waitingStart = useGUIState(guiManager, FLAPPY_UI_EVENTS.waitingStart, true);
    const isGameOver = useGUIState(guiManager, FLAPPY_UI_EVENTS.gameOver, false);
    const emitFlap = useGUIEmitter(guiManager, FLAPPY_UI_EVENTS.flapRequest);

    const playing = !waitingStart && !isGameOver;
    if (!playing) return null;

    return (
        <div style={{ position: 'absolute', right: '32px', bottom: '32px', zIndex: 1500 }}>
            <button
                style={{
                    background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '12px',
                    padding: '14px 22px',
                    fontSize: '16px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    letterSpacing: '1px',
                    boxShadow: '0 10px 24px rgba(22, 163, 74, 0.35)',
                    transition: 'transform 120ms ease, box-shadow 120ms ease',
                    userSelect: 'none'
                }}
                onClick={() => emitFlap()}
                onMouseDown={(e) => (e.currentTarget.style.transform = 'translateY(1px)')}
                onMouseUp={(e) => (e.currentTarget.style.transform = 'translateY(0)')}
            >
                FLAP
            </button>
        </div>
    );
}
