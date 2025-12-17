import { TileMapActor, TiledMap, TiledTileLayer, TiledTilesetReference } from "@repo/tiler";
import { Material, MaterialRenderContext } from "@repo/engine";

interface DrawCall {
    vao: WebGLVertexArrayObject | null;
    vertexBuffer: WebGLBuffer | null;
    indexBuffer: WebGLBuffer | null;
    indexCount: number;
    textureKey: string;
    opacity: number;
    layerIndex: number;
}

interface RenderCache {
    drawCalls: DrawCall[];
    map: TiledMap | null;
    scale: number;
}

interface TextureRecord {
    texture: WebGLTexture | null;
    promise: Promise<void> | null;
}

export class TileMapMaterial extends Material {
    private program: WebGLProgram | null = null;
    private uniformLocations: {
        viewProj: WebGLUniformLocation | null;
        translation: WebGLUniformLocation | null;
        opacity: WebGLUniformLocation | null;
        texture: WebGLUniformLocation | null;
    } = {
        viewProj: null,
        translation: null,
        opacity: null,
        texture: null
    };

    /**
     *
     */
    private caches = new WeakMap<TileMapActor, RenderCache>();
    private textureCache = new WeakMap<WebGL2RenderingContext, Map<string, TextureRecord>>();
    private loggedDiagonalWarning = false;

    public override render(context: MaterialRenderContext): boolean {
        const actor = context.actor;
        const camera = context.camera;
        const gl = context.gl;
        if (!(actor instanceof TileMapActor)) {
            return false;
        }
        const map = actor.getMap();
        if (!map) {
            return false;
        }

        const cache = this.ensureCache(gl, actor, map);
        if (!cache) {
            return false;
        }

        gl.useProgram(this.program);

        const aspect = gl.canvas.height === 0 ? 1 : gl.canvas.width / gl.canvas.height;
        const viewProjection = camera.getViewProjectionMatrix(aspect).elements as Float32Array;
        if (this.uniformLocations.viewProj) {
            gl.uniformMatrix3fv(this.uniformLocations.viewProj, false, viewProjection);
        }

        const actorPos = actor.getPosition();
        const translation = actorPos.add(actor.getRenderTranslation());
        if (this.uniformLocations.translation) {
            gl.uniform2f(this.uniformLocations.translation, translation.x, translation.y);
        }
        if (this.uniformLocations.texture) {
            gl.uniform1i(this.uniformLocations.texture, 0);
        }

        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

        const sortedDrawCalls = cache.drawCalls.slice().sort((a, b) => a.layerIndex - b.layerIndex);
        for (const call of sortedDrawCalls) {
            const texture = this.getTexture(gl, call.textureKey);
            if (!texture) {
                continue;
            }

            if (this.uniformLocations.opacity) {
                gl.uniform1f(this.uniformLocations.opacity, call.opacity);
            }

            if (call.vao) {
                gl.bindVertexArray(call.vao);
            } else {
                gl.bindBuffer(gl.ARRAY_BUFFER, call.vertexBuffer);
                gl.enableVertexAttribArray(0);
                gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0);
                gl.enableVertexAttribArray(1);
                gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 16, 8);
                gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, call.indexBuffer);
            }

            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, texture);
            gl.drawElements(gl.TRIANGLES, call.indexCount, gl.UNSIGNED_SHORT, 0);
        }

        gl.bindVertexArray(null);

        return true;
    }

    public compile(gl: WebGL2RenderingContext): void {
        if (this.program) {
            return;
        }

        const vertexSource = `#version 300 es
            precision highp float;
            layout(location=0) in vec2 a_position;
            layout(location=1) in vec2 a_uv;
            uniform mat3 u_viewProjection;
            uniform vec2 u_translation;
            out vec2 v_uv;
            void main() {
                vec2 worldPos = a_position + u_translation;
                vec3 clip = u_viewProjection * vec3(worldPos, 1.0);
                gl_Position = vec4(clip.xy, 0.0, 1.0);
                v_uv = a_uv;
            }`;
        const fragmentSource = `#version 300 es
            precision highp float;
            in vec2 v_uv;
            uniform sampler2D u_texture;
            uniform float u_opacity;
            out vec4 outColor;
            void main() {
                vec4 tex = texture(u_texture, v_uv);
                if (tex.a == 0.0) {
                    discard;
                }
                outColor = vec4(tex.rgb, tex.a * u_opacity);
            }`;

        const vertexShader = this.compileShader(gl, gl.VERTEX_SHADER, vertexSource);
        const fragmentShader = this.compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
        const program = gl.createProgram();
        if (!program) {
            throw new Error("Failed to create tile map shader program");
        }
        gl.attachShader(program, vertexShader);
        gl.attachShader(program, fragmentShader);
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            const info = gl.getProgramInfoLog(program);
            gl.deleteProgram(program);
            gl.deleteShader(vertexShader);
            gl.deleteShader(fragmentShader);
            throw new Error(`Failed to link tile map shader program: ${info ?? "unknown error"}`);
        }

        gl.deleteShader(vertexShader);
        gl.deleteShader(fragmentShader);

        this.program = program;
        this.uniformLocations.viewProj = gl.getUniformLocation(program, "u_viewProjection");
        this.uniformLocations.translation = gl.getUniformLocation(program, "u_translation");
        this.uniformLocations.opacity = gl.getUniformLocation(program, "u_opacity");
        this.uniformLocations.texture = gl.getUniformLocation(program, "u_texture");
    }

    private compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
        const shader = gl.createShader(type);
        if (!shader) {
            throw new Error("Failed to create shader");
        }
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            const info = gl.getShaderInfoLog(shader);
            gl.deleteShader(shader);
            throw new Error(`Failed to compile shader: ${info ?? "unknown error"}`);
        }
        return shader;
    }

    private ensureCache(gl: WebGL2RenderingContext, actor: TileMapActor, map: TiledMap): RenderCache | null {
        let cache = this.caches.get(actor);
        const scale = actor.getWorldUnitsPerPixel();
        if (!cache) {
            cache = { drawCalls: [], map: null, scale };
            this.caches.set(actor, cache);
        }

        if (cache.map !== map || cache.scale !== scale) {
            this.buildCache(gl, actor, map, cache, scale);
            cache.map = map;
            cache.scale = scale;
        }

        return cache;
    }

    private buildCache(gl: WebGL2RenderingContext, actor: TileMapActor, map: TiledMap, cache: RenderCache, scale: number): void {
        this.disposeCache(gl, cache);

        const tileWidthWorld = map.tileWidth * scale;
        const tileHeightWorld = map.tileHeight * scale;

        for (let layerIndex = 0; layerIndex < map.tileLayers.length; layerIndex++) {
            const layer: TiledTileLayer = map.tileLayers[layerIndex];
            if (!layer.visible || !layer.data.length) {
                continue;
            }

            interface GroupData {
                tileset: TiledTilesetReference;
                textureKey: string;
                vertices: number[];
                indices: number[];
            }

            const groups: GroupData[] = [];
            const groupMap = new Map<number, GroupData>();

            for (let i = 0; i < layer.data.length; i++) {
                const rawGid = layer.data[i];
                if (!rawGid) {
                    continue;
                }

                const decoded = this.decodeGid(rawGid);
                if (decoded.gid === 0) {
                    continue;
                }

                if (decoded.flipDiag) {
                    if (!this.loggedDiagonalWarning) {
                        console.warn("TileMapMaterial: Diagonal tile flips are not currently supported.");
                        this.loggedDiagonalWarning = true;
                    }
                    continue;
                }

                const tileset = this.findTileset(map.tilesets, decoded.gid);
                if (!tileset || !tileset.image) {
                    continue;
                }

                let group = groupMap.get(tileset.firstGid);
                if (!group) {
                    group = {
                        tileset,
                        textureKey: actor.resolveResourcePath(tileset.image.source),
                        vertices: [],
                        indices: []
                    };
                    groupMap.set(tileset.firstGid, group);
                    groups.push(group);
                }

                const localId = decoded.gid - tileset.firstGid;
                const tileColumn = localId % tileset.columns;
                const tileRow = Math.floor(localId / tileset.columns);

                const texWidth = tileset.image.width || tileset.tileWidth * tileset.columns;
                const texHeight = tileset.image.height || tileset.tileHeight * Math.ceil(tileset.tileCount / tileset.columns);

                // Add small epsilon to prevent texture bleeding between tiles
                const epsilon =1;
  

                let u0 = (tileColumn * tileset.tileWidth + epsilon) / texWidth;
                let v0 = (tileRow * tileset.tileHeight + epsilon) / texHeight;
                let u1 = ((tileColumn + 1) * tileset.tileWidth - epsilon) / texWidth;
                let v1 = ((tileRow + 1) * tileset.tileHeight - epsilon) / texHeight;

                if (decoded.flipH) {
                    [u0, u1] = [u1, u0];
                }
                if (decoded.flipV) {
                    [v0, v1] = [v1, v0];
                }

                const tileX = i % layer.width;
                const tileY = Math.floor(i / layer.width);

                const offsetX = (layer.offsetX ?? 0) * scale;
                const offsetY = (layer.offsetY ?? 0) * scale;

                const x0 = tileX * tileWidthWorld + offsetX;
                const y0 = -(tileY * tileHeightWorld + offsetY);
                const x1 = x0 + tileWidthWorld;
                const y1 = y0 - tileHeightWorld;

                const baseIndex = group.vertices.length / 4;
                group.vertices.push(
                    x0, y0, u0, v0,
                    x1, y0, u1, v0,
                    x1, y1, u1, v1,
                    x0, y1, u0, v1
                );
                group.indices.push(
                    baseIndex, baseIndex + 1, baseIndex + 2,
                    baseIndex, baseIndex + 2, baseIndex + 3
                );
            }

            for (const group of groups) {
                if (!group.indices.length) {
                    continue;
                }

                if (group.vertices.length / 4 > 65535) {
                    console.warn("TileMapMaterial: Layer has more than 65k vertices; skipping draw call.");
                    continue;
                }

                const vertexBuffer = gl.createBuffer();
                const indexBuffer = gl.createBuffer();
                if (!vertexBuffer || !indexBuffer) {
                    continue;
                }

                gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
                gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(group.vertices), gl.STATIC_DRAW);
                gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
                gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(group.indices), gl.STATIC_DRAW);

                const vao = gl.createVertexArray();
                if (vao) {
                    gl.bindVertexArray(vao);
                    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
                    gl.enableVertexAttribArray(0);
                    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0);
                    gl.enableVertexAttribArray(1);
                    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 16, 8);
                    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
                    gl.bindVertexArray(null);
                }

                cache.drawCalls.push({
                    vao,
                    vertexBuffer,
                    indexBuffer,
                    indexCount: group.indices.length,
                    textureKey: group.textureKey,
                    opacity: layer.opacity ?? 1,
                    layerIndex
                });
            }
        }
    }

    private disposeCache(gl: WebGL2RenderingContext, cache: RenderCache): void {
        for (const call of cache.drawCalls) {
            if (call.vao) {
                gl.deleteVertexArray(call.vao);
            }
            if (call.vertexBuffer) {
                gl.deleteBuffer(call.vertexBuffer);
            }
            if (call.indexBuffer) {
                gl.deleteBuffer(call.indexBuffer);
            }
        }
        cache.drawCalls = [];
    }

    private findTileset(tilesets: TiledTilesetReference[], gid: number): TiledTilesetReference | undefined {
        let candidate: TiledTilesetReference | undefined;
        for (const tileset of tilesets) {
            if (gid >= tileset.firstGid) {
                if (!candidate || tileset.firstGid > candidate.firstGid) {
                    candidate = tileset;
                }
            }
        }
        return candidate;
    }

    private decodeGid(rawGid: number): { gid: number; flipH: boolean; flipV: boolean; flipDiag: boolean } {
        const FLIP_H = 0x80000000;
        const FLIP_V = 0x40000000;
        const FLIP_D = 0x20000000;
        return {
            gid: rawGid & ~(FLIP_H | FLIP_V | FLIP_D),
            flipH: (rawGid & FLIP_H) !== 0,
            flipV: (rawGid & FLIP_V) !== 0,
            flipDiag: (rawGid & FLIP_D) !== 0
        };
    }

    private getTexture(gl: WebGL2RenderingContext, key: string): WebGLTexture | null {
        if (!key) {
            return null;
        }

        let contextCache = this.textureCache.get(gl);
        if (!contextCache) {
            contextCache = new Map();
            this.textureCache.set(gl, contextCache);
        }

        let record = contextCache.get(key);
        if (record?.texture) {
            return record.texture;
        }

        if (!record) {
            record = { texture: null, promise: null };
            contextCache.set(key, record);
        }

        if (!record.promise) {
            record.promise = this.loadTexture(gl, key)
                .then((texture) => {
                    record!.texture = texture;
                })
                .catch((error) => {
                    console.error(`Failed to load tileset texture '${key}':`, error);
                    contextCache!.delete(key);
                });
        }

        return null;
    }

    private async loadTexture(gl: WebGL2RenderingContext, src: string): Promise<WebGLTexture> {
        const image = await this.loadImage("public" + src);
        const texture = gl.createTexture();
        if (!texture) {
            throw new Error("Failed to create WebGL texture");
        }
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
        return texture;
    }

    private loadImage(src: string): Promise<HTMLImageElement> {
        return new Promise((resolve, reject) => {
            const image = new Image();
            image.crossOrigin = "anonymous";
            image.onload = () => resolve(image);
            image.onerror = () => reject(new Error(`Failed to load image '${src}'`));
            image.src = src;
        });
    }
}
