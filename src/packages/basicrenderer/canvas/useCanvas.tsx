import { useRef, useEffect } from "react";

const useCanvas = (compile: (gl: WebGL2RenderingContext) => void, draw: (context: WebGL2RenderingContext, frameCount: number) => void, _options = {}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const gl = canvas.getContext("webgl2");
    if (!gl) {
      console.error("Failed to acquire WebGL2 context for canvas.");
      return;
    }

    let frameCount = 0;
    let animationFrameId = 0;

    const resizeCanvas = () => {
      const dpr = window.devicePixelRatio ?? 1;
      const rect = canvas.getBoundingClientRect();
      const displayWidth = Math.max(1, Math.round(rect.width * dpr));
      const displayHeight = Math.max(1, Math.round(rect.height * dpr));

      if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
        canvas.width = displayWidth;
        canvas.height = displayHeight;
        gl.viewport(0, 0, displayWidth, displayHeight);
      }
    };

    compile(gl);

    const resizeObserver = new ResizeObserver(() => resizeCanvas());
    resizeObserver.observe(canvas);
    window.addEventListener("resize", resizeCanvas);
    resizeCanvas();

    const render = () => {
      frameCount++;
      resizeCanvas();

      gl.clearColor(0.0, 0.0, 0.0, 1.0); // Clear to black, fully opaque
      gl.clearDepth(1.0); // Clear everything
      gl.enable(gl.DEPTH_TEST); // Enable depth testing
      gl.depthFunc(gl.LEQUAL); // Near things obscure far things

      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

      draw(gl, frameCount);
      animationFrameId = window.requestAnimationFrame(render);
    };

    render();

    return () => {
      window.cancelAnimationFrame(animationFrameId);
      window.removeEventListener("resize", resizeCanvas);
      resizeObserver.disconnect();
    };
  }, [draw]);

  return canvasRef;
};

export default useCanvas;