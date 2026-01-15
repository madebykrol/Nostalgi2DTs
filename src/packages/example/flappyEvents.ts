export const FLAPPY_UI_EVENTS = {
    score: "flappy:score",
    highScore: "flappy:highScore",
    lastScore: "flappy:lastScore",
    finalScore: "flappy:finalScore",
    gameOver: "flappy:gameOver",
    waitingStart: "flappy:waitingStart",
    startRequest: "ui:flappy:start",
    restartRequest: "ui:flappy:restart",
    flapRequest: "ui:flappy:flap",
    useIndicators: "ui:flappy:useIndicators",
} as const;

export type FlappyUiEventName = typeof FLAPPY_UI_EVENTS[keyof typeof FLAPPY_UI_EVENTS];
