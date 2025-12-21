import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { EditorUIPlugin } from "@repo/engine";
import { Actor } from "@repo/engine";

const VIEWPORT_MARGIN = 16;
const MIN_WIDTH = 320;
const MIN_HEIGHT = 200;
const DEFAULT_WIDTH = 360;
const DEFAULT_HEIGHT = 260;

const ModalContainer = ({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) => {
  const [position, setPosition] = useState({ x: VIEWPORT_MARGIN, y: VIEWPORT_MARGIN });
  const [dimensions, setDimensions] = useState({ width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT });
  const [isMaximized, setIsMaximized] = useState(false);
  const dragSessionRef = useRef<{
    mode: "move" | "resize";
    pointerId: number;
    originX: number;
    originY: number;
    startX: number;
    startY: number;
    startWidth: number;
    startHeight: number;
  } | null>(null);
  const previousLayoutRef = useRef<{
    position: { x: number; y: number };
    dimensions: { width: number; height: number };
  } | null>(null);

  const clampPosition = useCallback(
    (x: number, y: number, width: number, height: number) => {
      const maxX = Math.max(VIEWPORT_MARGIN, window.innerWidth - width - VIEWPORT_MARGIN);
      const maxY = Math.max(VIEWPORT_MARGIN, window.innerHeight - height - VIEWPORT_MARGIN);
      return {
        x: Math.min(Math.max(VIEWPORT_MARGIN, x), maxX),
        y: Math.min(Math.max(VIEWPORT_MARGIN, y), maxY),
      };
    },
    []
  );

  const handlePointerMove = useCallback(
    (event: PointerEvent) => {
      const session = dragSessionRef.current;
      if (!session || session.pointerId !== event.pointerId) {
        return;
      }
      event.preventDefault();

      const deltaX = event.clientX - session.originX;
      const deltaY = event.clientY - session.originY;

      if (session.mode === "move") {
        const next = clampPosition(
          session.startX + deltaX,
          session.startY + deltaY,
          session.startWidth,
          session.startHeight
        );
        setPosition(next);
      } else {
        const maxWidth = Math.max(MIN_WIDTH, window.innerWidth - VIEWPORT_MARGIN * 2);
        const maxHeight = Math.max(MIN_HEIGHT, window.innerHeight - VIEWPORT_MARGIN * 2);
        const width = Math.min(maxWidth, Math.max(MIN_WIDTH, session.startWidth + deltaX));
        const height = Math.min(maxHeight, Math.max(MIN_HEIGHT, session.startHeight + deltaY));
        setDimensions((current) => (current.width === width && current.height === height ? current : { width, height }));
        setPosition((current) => {
          const next = clampPosition(current.x, current.y, width, height);
          return next;
        });
      }
    },
    [clampPosition]
  );

  const handlePointerUp = useCallback(
    (event?: PointerEvent) => {
      const session = dragSessionRef.current;
      if (event && session && session.pointerId !== event.pointerId) {
        return;
      }
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      dragSessionRef.current = null;
    },
    [handlePointerMove]
  );

  const beginInteraction = useCallback(
    (mode: "move" | "resize") => (event: ReactPointerEvent<HTMLDivElement>) => {
      if (isMaximized) {
        return;
      }
      if (mode === "move" && (event.target as HTMLElement | null)?.closest("[data-modal-control]") ) {
        return;
      }
      event.preventDefault();

      dragSessionRef.current = {
        mode,
        pointerId: event.pointerId,
        originX: event.clientX,
        originY: event.clientY,
        startX: position.x,
        startY: position.y,
        startWidth: dimensions.width,
        startHeight: dimensions.height,
      };

      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", handlePointerUp);
    },
    [dimensions.height, dimensions.width, handlePointerMove, handlePointerUp, isMaximized, position.x, position.y]
  );

  useEffect(() => {
    const center = clampPosition(
      (window.innerWidth - DEFAULT_WIDTH) / 2,
      (window.innerHeight - DEFAULT_HEIGHT) / 2,
      DEFAULT_WIDTH,
      DEFAULT_HEIGHT
    );
    setPosition(center);
  }, [clampPosition]);

  useEffect(() => {
    if (isMaximized) {
      handlePointerUp();
      return;
    }
    setPosition((current) => clampPosition(current.x, current.y, dimensions.width, dimensions.height));
  }, [clampPosition, dimensions.height, dimensions.width, handlePointerUp, isMaximized]);

  useEffect(() => {
    if (isMaximized) {
      return;
    }
    const handleResize = () => {
      setDimensions((current) => {
        const maxWidth = Math.max(MIN_WIDTH, window.innerWidth - VIEWPORT_MARGIN * 2);
        const maxHeight = Math.max(MIN_HEIGHT, window.innerHeight - VIEWPORT_MARGIN * 2);
        const width = Math.min(current.width, maxWidth);
        const height = Math.min(current.height, maxHeight);
        setPosition((previous) => clampPosition(previous.x, previous.y, width, height));
        if (width === current.width && height === current.height) {
          return current;
        }
        return { width, height };
      });
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [clampPosition, isMaximized]);

  useEffect(() => {
    return () => {
      handlePointerUp();
    };
  }, [handlePointerUp]);

  const handleToggleMaximize = useCallback(() => {
    if (isMaximized) {
      setIsMaximized(false);
      const previous = previousLayoutRef.current;
      if (previous) {
        setDimensions(previous.dimensions);
        setPosition(previous.position);
      } else {
        const centered = clampPosition(
          (window.innerWidth - DEFAULT_WIDTH) / 2,
          (window.innerHeight - DEFAULT_HEIGHT) / 2,
          DEFAULT_WIDTH,
          DEFAULT_HEIGHT
        );
        setDimensions({ width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT });
        setPosition(centered);
      }
    } else {
      previousLayoutRef.current = {
        position: { ...position },
        dimensions: { ...dimensions },
      };
      setIsMaximized(true);
    }
    handlePointerUp();
  }, [clampPosition, dimensions.height, dimensions.width, handlePointerUp, isMaximized, position.x, position.y]);

  const modalGeometry: CSSProperties = isMaximized
    ? {
        top: VIEWPORT_MARGIN,
        left: VIEWPORT_MARGIN,
        width: `calc(100vw - ${VIEWPORT_MARGIN * 2}px)`,
        height: `calc(100vh - ${VIEWPORT_MARGIN * 2}px)`,
      }
    : {
        top: position.y,
        left: position.x,
        width: dimensions.width,
        height: dimensions.height,
      };

  const modalStyle: CSSProperties = {
    position: "absolute",
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    ...modalGeometry,
  };

  return (
    <div className="fixed inset-0 pointer-events-none">
      <div
        className="pointer-events-auto flex flex-col rounded-lg border border-white/10 bg-[#0b1220] text-white shadow-[0_18px_45px_rgba(10,12,24,0.55)]"
        style={modalStyle}
      >
        <header
          className="flex cursor-move select-none items-center justify-between border-b border-white/10 px-4 py-2 text-xs"
          onPointerDown={beginInteraction("move")}
          onDoubleClick={handleToggleMaximize}
        >
          <h2 className="text-sm font-semibold uppercase tracking-wide text-white/80">{title}</h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              data-modal-control
              className="rounded px-2 py-1 text-xs text-white/70 hover:bg-white/10"
              onClick={handleToggleMaximize}
            >
              {isMaximized ? "Restore" : "Maximize"}
            </button>
            <button
              type="button"
              data-modal-control
              className="rounded px-2 py-1 text-xs text-white/70 hover:bg-white/10"
              onClick={onClose}
            >
              Close
            </button>
          </div>
        </header>
        <div className="flex-1 overflow-auto p-4 text-xs text-white/80 space-y-2">{children}</div>
        <div
          className="absolute bottom-1 right-1 h-3 w-3 cursor-se-resize rounded-sm border border-white/40 bg-white/30"
          onPointerDown={beginInteraction("resize")}
          data-modal-control
          aria-label="Resize modal"
        />
      </div>
    </div>
  );
};

const simpleModalPlugin: EditorUIPlugin = {
  id: "builtin.simple-modal",
  activate: ({ modalTriggers }: { modalTriggers: any }) => {
    const unregisterActorDoubleClick = modalTriggers.register({
      id: "builtin.simple-modal.actor-double-click",
      event: "actor.doubleClick",
      render: ({ actor } : { actor: Actor }, api: any) => (
        <ModalContainer title="Actor Details" onClose={api.close}>
          <p>
            Actor double-clicked:
            <br />
            <strong>{(actor as any).name ?? actor.constructor.name}</strong>
          </p>
          <p>ID: {actor.getId()}</p>
        </ModalContainer>
      ),
    });

    const unregisterToolsMenu = modalTriggers.register({
      id: "builtin.simple-modal.tools-menu",
      event: "toolbar.menu",
      menuId: "tools",
      render: (_context: any, api: any) => (
        <ModalContainer title="Tools Menu" onClose={api.close}>
          <p>Select a tool from this menu placeholder.</p>
          <p>Extend this modal or replace it via a plugin.</p>
        </ModalContainer>
      ),
    });

    return () => {
      unregisterActorDoubleClick();
      unregisterToolsMenu();
    };
  },
};

export default simpleModalPlugin;