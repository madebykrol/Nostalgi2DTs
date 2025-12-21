import useCanvas from "./useCanvas";

const Canvas = (props: any) => {
  const { draw, compile, fps, options = {}, ...rest } = props;
  const { context = "webgl2", ...moreConfig } = options ?? {};
  const canvasRef = useCanvas(compile, draw, { context });

  return <canvas ref={canvasRef} {...moreConfig} {...rest} id="gamescreen" />;
};

export default Canvas;