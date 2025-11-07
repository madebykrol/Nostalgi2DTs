
import useCanvas from './useCanvas'

const Canvas = (props: any) => {

  const { draw, fps, options, ...rest } = props
  const { context, ...moreConfig } = options
  const canvasRef = useCanvas(draw, {context})

  return <><canvas ref={canvasRef} {...rest} {...moreConfig} id="gamescreen" width="900" height="500"/></>
}

export default Canvas