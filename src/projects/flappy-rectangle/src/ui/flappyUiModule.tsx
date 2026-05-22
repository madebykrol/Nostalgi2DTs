import { Fragment } from "react";
import type { GUIModule } from "@nostalgi2d/engine";
import { FlappyRectangleFlapButton, FlappyRectangleGameOverUI, FlappyRectangleScoreUI, FlappyRectangleStartUI } from "./FlappyRectangleScoreUI";

const FlappyUIRoot = () => {
    if (typeof console !== "undefined" && console.debug) {
        console.debug("FlappyUIRoot render");
    }
    return (
        <Fragment>
            <FlappyRectangleScoreUI />
            <FlappyRectangleGameOverUI />
            <FlappyRectangleStartUI />
            <FlappyRectangleFlapButton />
        </Fragment>
    );
};

export const flappyUiModule: GUIModule = {
    id: "flappy-ui",
    entrypoint: {
        id: "flappy-ui-root",
        component: FlappyUIRoot,
        zIndex: 100,
        visible: true,
    },
};
