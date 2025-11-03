import { useRef, useEffect } from 'react'

const useCanvas = (draw: (context: WebGL2RenderingContext, frameCount: number) => void, _options={}) => {

  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    
    const canvas = canvasRef.current
    const gl = canvas?.getContext('webgl2')!
    let frameCount = 0
    let animationFrameId = 0

    const render = () => {
      frameCount++;
      
        gl.clearColor(0.0, 0.0, 0.0, 1.0); // Clear to black, fully opaque
        gl.clearDepth(1.0); // Clear everything
        gl.enable(gl.DEPTH_TEST); // Enable depth testing
        gl.depthFunc(gl.LEQUAL); // Near things obscure far things

        // Clear the canvas before we start drawing on it

        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      
      draw(gl, frameCount)
      animationFrameId = window.requestAnimationFrame(render)
    }
    render()
    return () => {
      window.cancelAnimationFrame(animationFrameId)
    }
  }, [draw])
  return canvasRef
}
export default useCanvas