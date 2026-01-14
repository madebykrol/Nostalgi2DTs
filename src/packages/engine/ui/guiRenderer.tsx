import { Fragment } from "react";
import { useGUIComponents } from "./guiContext";

/**
 * Component that renders all registered GUI components
 * Place this in your main game UI component to render all game UI
 * 
 * @example
 * ```tsx
 * function GameUI() {
 *   return (
 *     <div className="game-ui-container">
 *       <GUIRenderer />
 *     </div>
 *   );
 * }
 * ```
 */
export function GUIRenderer() {
    const components = useGUIComponents();

    return (
        <>
            {components.map((config) => {
                const Component = config.component;
                return (
                    <Fragment key={config.id}>
                        <Component {...(config.props || {})} />
                    </Fragment>
                );
            })}
        </>
    );
}
