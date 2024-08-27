import * as dat from 'dat.gui';

const canvas = document.createElement("canvas");
document.documentElement.appendChild(canvas);

const config = {
    aspectRatio: 4 / 3,
    canvasWidth: 1024,
    randomPatternScale: 5,
    zoom: 1,
    interface: "image",
    initState: "starter",
    maxResolution: 8,
    invert: 1,
    speed: 60,
    patternSplit: 7,
    contrast: 75,
    zoomCam: 2.0,
    edgeInfluence: 0.0,
    brightnessInfluence: 0.0,
    patternScale: 4,
    brushSize: 0.01,
    brushStrength: 1.0,
};

async function setupCamera() {
    const video = document.createElement('video');
    try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            throw new Error('Your browser does not support the required media APIs');
        }
        console.log('Attempting to get user media...');
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        console.log('User media obtained successfully');
        video.srcObject = stream;
        console.log('Video source object set');
        await video.play();
        console.log('Video playback initiated');
        return video;
    } catch (error) {
        console.error('Detailed error in setupCamera:', error);
        displayErrorMessage("Camera access is not available. Please check your browser settings and ensure you're using a secure connection (HTTPS).");
        return null;
    }
}

let cameraInput;
setupCamera().then(video => {
    if (video) {
        console.log("Camera input successfully set up");
        cameraInput = {
            video,
            captureVideoFrame: () => {
                const canvas = document.createElement('canvas');
                canvas.width = config.canvasWidth;
                canvas.height = config.canvasHeight;
                const ctx = canvas.getContext('2d');
                
                const videoAspect = video.videoWidth / video.videoHeight;
                const canvasAspect = canvas.width / canvas.height;
                let sx, sy, sw, sh;
                if (videoAspect > canvasAspect) {
                    sh = video.videoHeight;
                    sw = sh * canvasAspect;
                    sy = 0;
                    sx = (video.videoWidth - sw) / 2;
                } else {
                    sw = video.videoWidth;
                    sh = sw / canvasAspect;
                    sx = 0;
                    sy = (video.videoHeight - sh) / 2;
                }
                
                let zoomedSW = sw / config.zoomCam;
                let zoomedSH = sh / config.zoomCam;
                sx += (sw - zoomedSW) / 2;
                sy += (sh - zoomedSH) / 2;
                sw = zoomedSW;
                sh = zoomedSH;

                ctx.save();
                ctx.scale(-1, -1);
                ctx.translate(-canvas.width, -canvas.height);
                ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
                ctx.restore();
                
                if (config.invert) {
                    ctx.globalCompositeOperation = 'difference';
                    ctx.fillStyle = 'white';
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                }

                // Apply contrast
                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const data = imageData.data;
                const factor = (259 * (config.contrast + 255)) / (255 * (259 - config.contrast));

                for (let i = 0; i < data.length; i += 4) {
                    data[i] = factor * (data[i] - 128) + 128;
                    data[i + 1] = factor * (data[i + 1] - 128) + 128;
                    data[i + 2] = factor * (data[i + 2] - 128) + 128;
                }

                ctx.putImageData(imageData, 0, 0);
                
                return canvas;
            },
            setZoom: (zoom) => {
                config.zoomCam = zoom;
            }
        };
    } else {
        console.error('Failed to set up camera input');
    }
}).catch(error => {
    console.error('Unexpected error in setupCamera:', error);
    displayErrorMessage("An unexpected error occurred while setting up the camera.");
});

function updateTexture() {
    if (!cameraInput) {
        console.log("No camera input available");
        return;
    }

    try {
        const processedFrame = cameraInput.captureVideoFrame();
        if (processedFrame) {
            if (currentTexture === null) {
                currentTexture = new ImageTexture(processedFrame);
            } else {
                currentTexture.uploadToGPU(processedFrame);
            }
        } else {
            console.error("Failed to capture video frame");
        }
    } catch (error) {
        console.error("Error in updateTexture:", error);
    }
}

config.canvasHeight = Math.round(config.canvasWidth / config.aspectRatio);

const shaderUtils = {
    enDe16: `
    float de16(vec2 v) {
        return dot(v, vec2(255.0 / 256.0, 1.0 / 256.0));
    }
    vec2 en16(float f) {
        f = 255.99 * clamp(f, 0.0, 1.0);
        return vec2(floor(f) / 255.0, fract(f));
    }
    `,
    samT: `
    vec2 de(vec4 encoded) {
        return vec2(de16(encoded.rg), de16(encoded.ba));
    }
    vec4 en(vec2 decoded) {
        return vec4(en16(decoded.x), en16(decoded.y));
    }
    float samT(sampler2D tex, vec2 position) {
        vec4 sTex = texture(tex, position);
        return de(sTex).y;
    }
    `
};

const shaders = {
    disVert: `#version 300 es
    uniform vec2 s;
    uniform float z;
    in vec2 co;
    out vec2 vS;
    void main(void) {
        gl_Position = vec4(co * s * z, 0, 1);
        vS = 0.5 + 0.5 * co;
    }
    `,
    disColFrag: `#version 300 es
    precision mediump float;
    uniform sampler2D uR, uG, uB;
    in vec2 vS;  
    out vec4 fragColor;
    ${shaderUtils.enDe16}
    ${shaderUtils.samT}
    
    void main() {
        float red = samT(uR, vS);
        float green = samT(uG, vS);
        float blue = samT(uB, vS);
    
        vec3 edge0 = vec3(0.20, 0.21, 0.22);
        vec3 edge1 = vec3(0.23, 0.24, 0.25);
        vec3 smoothColor = smoothstep(edge0, edge1, vec3(red, green, blue));

        if(#INJECT(uInvert) == 1.0) {
        fragColor = vec4(1.0 - smoothColor, 1.0);
        } else {
        fragColor = vec4(smoothColor, 1.0);
        }
    }
    `,
    upVert: `#version 300 es
    in vec2 co;
    out vec2 vS;
    void main(void) {
        gl_Position = vec4(co, 0, 1);
        vS = 0.5 + 0.5 * co;
    }
    `,
    resFrag: `#version 300 es        
    precision mediump float;
    uniform vec2 uPat;

    in vec2 vS;
    out vec4 fragColor;

    ${shaderUtils.enDe16}
    ${shaderUtils.samT}

    float random(vec2 st) {
        return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
    }

    void main() {
        float width = 2160.0;
        float height = 1620.0;
      
        float aspectRatio = width / height;
        
        const int numberOfDots = 50;
        float dotRadius = 0.005;
        
        float starter = 0.0;
        
        for(int i = 0; i < numberOfDots; ++i) {
            vec2 dotPos = vec2(
                random(vec2(float(i), 0.12345)),
                random(vec2(float(i), 0.67890))
            );
            
            dotPos.x *= aspectRatio;
            
            float distToDot = distance(vS * vec2(aspectRatio, 1.0), dotPos);
            if(distToDot < dotRadius) {
                starter = 1.0;
                break;
            }
        }
        
        const float A = 1.0;
        float B = dot(uPat, vec2(starter, 0));
        vec2 values = vec2(A, B);
        
        fragColor = en(values);
    }
    `,
    imageMapFrag: `#version 300 es
    precision mediump float;

    uniform sampler2D uPI;
    uniform sampler2D uImageMapTexture;
    uniform vec2 uTex;
    uniform vec4 uSampledChannel;
    uniform float uDiffuseScaling;
    uniform float uEdgeInfluence;
    uniform float uBrightnessInfluence;
    uniform vec2 uBrushPosition;
    uniform float uBrushSize;
    uniform float uBrushStrength;
    uniform vec2 uResolution;

    in vec2 vS;
    out vec4 fragColor;
    ${shaderUtils.enDe16}
    ${shaderUtils.samT}

    float luminance(vec3 color) {
        return dot(color, vec3(0.299, 0.587, 0.114));
    }

    vec2 kernel(vec2 decodedCenter) {
        return
            de(texture(uPI, vS + vec2(-1, -1) * uTex)) * 0.05 +
            de(texture(uPI, vS + vec2(+0, -1) * uTex)) * 0.20 +
            de(texture(uPI, vS + vec2(+1, -1) * uTex)) * 0.05 +
    
            de(texture(uPI, vS + vec2(-1, +0) * uTex)) * 0.20 -
            decodedCenter +
            de(texture(uPI, vS + vec2(+1, +0) * uTex)) * 0.20 +
    
            de(texture(uPI, vS + vec2(-1, +1) * uTex)) * 0.05 +
            de(texture(uPI, vS + vec2(+0, +1) * uTex)) * 0.20 +
            de(texture(uPI, vS + vec2(+1, +1) * uTex)) * 0.05;
    }

    float detectEdges(sampler2D tex, vec2 uv, vec2 step) {
        float tl = luminance(texture(tex, uv + vec2(-step.x, -step.y)).rgb);
        float t  = luminance(texture(tex, uv + vec2(0.0, -step.y)).rgb);
        float tr = luminance(texture(tex, uv + vec2(step.x, -step.y)).rgb);
        float r  = luminance(texture(tex, uv + vec2(step.x, 0.0)).rgb);
        float br = luminance(texture(tex, uv + vec2(step.x, step.y)).rgb);
        float b  = luminance(texture(tex, uv + vec2(0.0, step.y)).rgb);
        float bl = luminance(texture(tex, uv + vec2(-step.x, step.y)).rgb);
        float l  = luminance(texture(tex, uv + vec2(-step.x, 0.0)).rgb);
        float dX = (tr + 2.0 * r + br) - (tl + 2.0 * l + bl);
        float dY = (bl + 2.0 * b + br) - (tl + 2.0 * t + tr);
        return length(vec2(dX, dY));
    }

    void main() {
    vec2 values = de(texture(uPI, vS));
    float A = values.x;
    float B = values.y;

    vec4 sampledColor = texture(uImageMapTexture, vS);
    float mapValue = dot(uSampledChannel, sampledColor);
    
    float brightness = luminance(sampledColor.rgb);
    float edge = detectEdges(uImageMapTexture, vS, uTex);
    
    mapValue = mix(mapValue, 1.0, brightness * uBrightnessInfluence);
    mapValue = mix(mapValue, 1.0, edge * uEdgeInfluence);
    
    float aspectRatio = uResolution.x / uResolution.y;

    vec2 brushPos = uBrushPosition;
    brushPos.x *= aspectRatio;
    vec2 pixelPos = vS;
    pixelPos.x *= aspectRatio;
    float distToBrush = distance(pixelPos, brushPos) / aspectRatio;
    float brushInfluence = smoothstep(uBrushSize, uBrushSize - 0.001, distToBrush);
    
    A = mix(A, 1.0, brushInfluence * uBrushStrength);
    B = mix(B, 1.0, brushInfluence * uBrushStrength);

    float feedA = mix(0.02220, 0.04470, mapValue);
    float killB = mix(0.06516, 0.05789, mapValue);
    
    feedA = mix(feedA, feedA * (1.0 - brightness), uBrightnessInfluence);
    killB = mix(killB, killB * (1.0 + brightness), uBrightnessInfluence);
    
    feedA = mix(feedA, feedA * (1.0 - edge), uEdgeInfluence);
    killB = mix(killB, killB * (1.0 + edge), uEdgeInfluence);
    
    float diffA = 0.210;
    float diffB = 0.105;

    vec2 laplace = kernel(values);
    float reaction = A * B * B;
    const float dt = 1.0;
    
    A = A + dt * (uDiffuseScaling * diffA * laplace.x - reaction + feedA * (1.0 - A));
    B = B + dt * (uDiffuseScaling * diffB * laplace.y + reaction - (killB + feedA) * B);

    fragColor = en(vec2(A, B));
    }
    `,
    updateMapFrag: `#version 300 es
    precision mediump float;
    
    uniform sampler2D uPI;
    uniform vec2 uTex;
    uniform vec2 uRates;
    
    in vec2 vS;
    out vec4 fragColor;
    ${shaderUtils.enDe16}
    ${shaderUtils.samT}
    vec2 kernel(vec2 decodedCenter) {
        return
            de(texture(uPI, vS + vec2(-1, -1) * uTex)) * 0.05 +
            de(texture(uPI, vS + vec2(+0, -1) * uTex)) * 0.20 +
            de(texture(uPI, vS + vec2(+1, -1) * uTex)) * 0.05 +
    
            de(texture(uPI, vS + vec2(-1, +0) * uTex)) * 0.20 -
            decodedCenter +
            de(texture(uPI, vS + vec2(+1, +0) * uTex)) * 0.20 +
        
            de(texture(uPI, vS + vec2(-1, +1) * uTex)) * 0.05 +
            de(texture(uPI, vS + vec2(+0, +1) * uTex)) * 0.20 +
            de(texture(uPI, vS + vec2(+1, +1) * uTex)) * 0.05;
    }

    vec4 computeNewValue(const float feedA, const float killB, const float diffA, const float diffB) {
        vec2 values = de(texture(uPI, vS));
        vec2 laplace = kernel(values);
    
        float A = values.x;
        float B = values.y;
        float reaction = A * B * B;
        const float dt = 1.0;
        values = vec2(
            values.x + dt * (diffA * laplace.x - reaction + feedA * (1.0 - A)),
            values.y + dt * (diffB * laplace.y + reaction - (killB + feedA) * B)
        );
    
        return en(values);
    }
    
    void main() {
        float feedA = mix(#INJECT(FEED_MIN), #INJECT(FEED_MAX), vS.y);
        float killB = mix(#INJECT(KILL_MIN), #INJECT(KILL_MAX), vS.x);
    
        fragColor = computeNewValue(feedA, killB, uRates.x, uRates.y);
    }`,
};

let gl = null;

function initGL(flags) {
    gl = canvas.getContext("webgl2", flags);
    if (!gl) {
        console.error("Your browser or device does not support WebGL 2.");
        return false;
    }
    gl.disable(gl.CULL_FACE);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.clearColor(1, 1, 1, 1);
    return true;
}

function adjustSize() {
    const width = 2160;
    const height = 1620;
    if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
    }
}

class GLResource {
    constructor(gl) {
        this._gl = gl;
    }
    gl() {
        return this._gl;
    }
}

class ShaderProgram extends GLResource {
    constructor(gl, vertexSource, fragmentSource) {
        super(gl);
        this.id = null;
        this.uCount = 0;
        this.aCount = 0;
        this.u = {};
        this.a = {};

        const vertexShader = this.createShader(gl.VERTEX_SHADER, vertexSource);
        const fragmentShader = this.createShader(gl.FRAGMENT_SHADER, fragmentSource);

        if (vertexShader && fragmentShader) {
            this.createProgram(vertexShader, fragmentShader);
        }
    }

    createShader(type, source) {
        const gl = this.gl();
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        const success = gl.getShaderParameter(shader, gl.COMPILE_STATUS);
        if (success) {
            return shader;
        }

        console.error(gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
    }

    createProgram(vertexShader, fragmentShader) {
        const gl = this.gl();
        const program = gl.createProgram();
        gl.attachShader(program, vertexShader);
        gl.attachShader(program, fragmentShader);
        gl.linkProgram(program);
        const success = gl.getProgramParameter(program, gl.LINK_STATUS);
        if (success) {
            this.id = program;
            this.introspection();
        } else {
            console.error(gl.getProgramInfoLog(program));
            gl.deleteProgram(program);
        }
    }

    use() {
        this.gl().useProgram(this.id);
    }

    bindUniforms() {
        const gl = this.gl();
        let currTextureUnitNb = 0;
        Object.keys(this.u).forEach((uName) => {
            const uniform = this.u[uName];
            if (uniform.value !== null) {
                if (uniform.type === gl.SAMPLER_2D || uniform.type === gl.SAMPLER_CUBE) {
                    const unitNb = currTextureUnitNb;
                    gl.uniform1i(uniform.loc, unitNb);
                    gl.activeTexture(gl.TEXTURE0 + unitNb);
                    gl.bindTexture(gl.TEXTURE_2D, uniform.value);
                    currTextureUnitNb++;
                } else if (uniform.type === gl.FLOAT) {
                    gl.uniform1f(uniform.loc, uniform.value);
                } else if (uniform.type === gl.FLOAT_VEC2) {
                    gl.uniform2fv(uniform.loc, uniform.value);
                } else if (uniform.type === gl.FLOAT_VEC4) {
                    gl.uniform4fv(uniform.loc, uniform.value);
                } else if (uniform.type === gl.BOOL) {
                    gl.uniform1i(uniform.loc, uniform.value);
                }
            }
        });
    }

    bindAttributes() {
        Object.keys(this.a).forEach((aName) => {
            const attribute = this.a[aName];
            if (attribute.VBO !== null) {
                attribute.VBO.bind(attribute.loc);
            }
        });
    }

    bindUniformsAndAttributes() {
        this.bindUniforms();
        this.bindAttributes();
    }

    introspection() {
        const gl = this.gl();
        this.uCount = gl.getProgramParameter(this.id, gl.ACTIVE_UNIFORMS);
        this.u = {};
        for (let i = 0; i < this.uCount; i++) {
            const uniform = gl.getActiveUniform(this.id, i);
            const name = uniform.name;
            this.u[name] = {
                loc: gl.getUniformLocation(this.id, name),
                size: uniform.size,
                type: uniform.type,
                value: null,
            };
        }
        this.aCount = gl.getProgramParameter(this.id, gl.ACTIVE_ATTRIBUTES);
        this.a = {};
        for (let i = 0; i < this.aCount; i++) {
            const attribute = gl.getActiveAttrib(this.id, i);
            const name = attribute.name;
            this.a[name] = {
                VBO: null,
                loc: gl.getAttribLocation(this.id, name),
                size: attribute.size,
                type: attribute.type,
            };
        }
    }
}

class VBO extends GLResource {
    static createQuad(gl, minX, minY, maxX, maxY) {
        const vert = [
            minX, minY,
            maxX, minY,
            minX, maxY,
            maxX, maxY,
        ];
        return new VBO(gl, new Float32Array(vert), 2, gl.FLOAT, true);
    }
    constructor(gl, array, size, type, staticUsage = true) {
        super(gl);
        this.id = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.id);

        gl.bufferData(gl.ARRAY_BUFFER, array, gl.STATIC_DRAW);

        gl.bindBuffer(gl.ARRAY_BUFFER, null);
        this.size = size;
        this.type = type;
        this.normalize = false;
        this.stride = 0;
        this.offset = 0;
    }
    bind(location) {
        const gl = super.gl();
        gl.enableVertexAttribArray(location);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.id);
        gl.vertexAttribPointer(location, this.size, this.type, this.normalize, this.stride, this.offset);
    }
}

class RenderToTexture {
    constructor() {
        this.texture = gl.createTexture();
        this.framebuffer = gl.createFramebuffer();
        this._width = -1;
        this._height = -1;
    }
    reserveSpace(wantedWidth, wantedHeight) {
        wantedWidth = Math.ceil(wantedWidth);
        wantedHeight = Math.ceil(wantedHeight);
        if (this.width !== wantedWidth || this.height !== wantedHeight) {
            gl.bindTexture(gl.TEXTURE_2D, this.texture);
            const format = gl.RGBA;
            gl.texImage2D(gl.TEXTURE_2D, 0, format, wantedWidth, wantedHeight, 0, format, gl.UNSIGNED_BYTE, null);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.texture, 0);
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            gl.bindTexture(gl.TEXTURE_2D, null);
            this._width = wantedWidth;
            this._height = wantedHeight;
        }
    }
    get width() {
        return this._width;
    }
    get height() {
        return this._height;
    }
}

class RenderToTextureSwapable {
    constructor() {
        this.previousTexture = new RenderToTexture();
        this.currentTexture = new RenderToTexture();
    }
    get previous() {
        return this.previousTexture.texture;
    }
    get current() {
        return this.currentTexture.texture;
    }
    get currentFramebuffer() {
        return this.currentTexture.framebuffer;
    }
    get width() {
        return this.previousTexture.width;
    }
    get height() {
        return this.previousTexture.height;
    }
    reserveSpace(width, height) {
        this.previousTexture.reserveSpace(width, height);
        this.currentTexture.reserveSpace(width, height);
    }
    swap() {
        [this.currentTexture, this.previousTexture] = [this.previousTexture, this.currentTexture];
    }
}

class ReactionDiffusion {
    constructor() {
        this.lastUpdateTimestamp = 0;
        this.targetWidth = 1;
        this.targetHeight = 1;
        this.squareVBO = null;
        this.vao = null;
        this.internalTextures = [
            new RenderToTextureSwapable(),
            new RenderToTextureSwapable(),
            new RenderToTextureSwapable(),
        ];

        this.needToReset = true;
        this.lastIterationUpdate = performance.now() - 5000;
        this._iteration = 0;

        this.brush = {
            position: [0, 0],
            size: 0.05,
            strength: 0.5,
            isDrawing: false
        };

        this.initializeVAO();
        this.loadShaders();
        this.setupBrushListeners();
    }

    initializeVAO() {
        this.vao = gl.createVertexArray();
        gl.bindVertexArray(this.vao);
        this.squareVBO = VBO.createQuad(gl, -1, -1, +1, +1);
        gl.bindVertexArray(null);
    }

    loadShaders() {
        this.asyncLoadShader("display-tricolor", shaders.disVert, shaders.disColFrag,
            (shader) => { this.displayTricolorShader = shader; },
            { uInvert: ReactionDiffusion.uInvert.toFixed(1) }
        );
        this.asyncLoadShader("update-map", shaders.upVert, shaders.updateMapFrag,
            (shader) => { this.updateMapShader = shader; },
            {
                FEED_MIN: ReactionDiffusion.FEED_MIN.toFixed(5),
                FEED_MAX: ReactionDiffusion.FEED_MAX.toFixed(5),
                KILL_MIN: ReactionDiffusion.KILL_MIN.toFixed(5),
                KILL_MAX: ReactionDiffusion.KILL_MAX.toFixed(5),
            }
        );
        this.asyncLoadShader("update-image", shaders.upVert, shaders.imageMapFrag,
            (shader) => { this.updateImageMapShader = shader; }
        );
        this.asyncLoadShader("reset", shaders.upVert, shaders.resFrag,
            (shader) => { this.resetShader = shader; },
            { PATTERN_SPLIT: `int(${config.patternSplit})` }
        );
    }

    setupBrushListeners() {
        const canvas = gl.canvas;

        const updateBrushPosition = (e) => {
            const rect = canvas.getBoundingClientRect();
            const scaleX = canvas.width / rect.width;
            const scaleY = canvas.height / rect.height;
            const x = (e.clientX - rect.left) * scaleX / canvas.width;
            const y = 1 - (e.clientY - rect.top) * scaleY / canvas.height;
            this.brush.position = [x, y];
        };

        canvas.addEventListener('mousedown', (e) => {
            this.brush.isDrawing = true;
            updateBrushPosition(e);
        });

        canvas.addEventListener('mousemove', (e) => {
            updateBrushPosition(e);
        });

        canvas.addEventListener('mouseup', () => {
            this.brush.isDrawing = false;
        });

        canvas.addEventListener('mouseout', () => {
            this.brush.isDrawing = false;
        });

        canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.brush.isDrawing = true;
            updateBrushPosition(e.touches[0]);
        });

        canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            updateBrushPosition(e.touches[0]);
        });

        canvas.addEventListener('touchend', () => {
            this.brush.isDrawing = false;
        });
    }

    resize(width, height) {
        this.targetWidth = width;
        this.targetHeight = height;
    }

    reset() {
        this.needToReset = true;
    }

    drawToCanvas() {
        gl.bindVertexArray(this.vao);
        gl.viewport(0, 0, this.targetWidth, this.targetHeight);
        let shader = this.displayTricolorShader;

        if (shader) {
            shader.use();

            shader.u["uR"].value = this.internalTextures[0].current;
            shader.u["uG"].value = this.internalTextures[1].current;
            shader.u["uB"].value = this.internalTextures[2].current;

            const canvasAspectRatio = this.targetWidth / this.targetHeight;
            const internalTextureAspectRatio = this.internalTextures[0].width / this.internalTextures[0].height;
            shader.u["s"].value = [internalTextureAspectRatio / canvasAspectRatio, 1];
            shader.u["z"].value = config.zoom;

            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            shader.bindUniformsAndAttributes();
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        }

        gl.bindVertexArray(null);
    }

    update() {
        if (this.adjustInternalTextureSize()) {
            this.needToReset = true;
        }
        gl.viewport(0, 0, this.internalTextures[0].width, this.internalTextures[0].height);
        if (this.needToReset) {
            this.iteration = 0;
            if (!this.clearInternalTextures()) {
                return;
            }
            this.needToReset = false;
        }

        const nbIterations = this.computeNbIterationsForThisFrame();
        if (nbIterations <= 0) {
            return;
        }

        if (config.interface === "image" && this.updateImageMapShader) {
            const inputImageTexture = getTexture();
            this.updateImageMapShader.use();
            this.updateImageMapShader.u["uImageMapTexture"].value = inputImageTexture.id;
            this.updateImageMapShader.u["uDiffuseScaling"].value = config.randomPatternScale;
            this.updateImageMapShader.u["uTex"].value = [1 / this.internalTextures[0].width, 1 / this.internalTextures[0].height];
            this.updateImageMapShader.u["uEdgeInfluence"].value = config.edgeInfluence;
            this.updateImageMapShader.u["uBrightnessInfluence"].value = config.brightnessInfluence;

            this.updateImageMapShader.u["uResolution"].value = [this.targetWidth, this.targetHeight];

            this.updateImageMapShader.u["uBrushPosition"].value = this.brush.position;
            this.updateImageMapShader.u["uBrushSize"].value = config.brushSize;
            this.updateImageMapShader.u["uBrushStrength"].value = this.brush.isDrawing ? config.brushStrength : 0.0;

            this.updateImageMapShader.bindAttributes();

            const splitNbIterations = Math.ceil(nbIterations / 3);
            this.updateImageMapShader.u["uSampledChannel"].value = [1, 0, 0, 0];
            this.updateInternal(this.updateImageMapShader, splitNbIterations, this.internalTextures[0]);
            this.updateImageMapShader.u["uSampledChannel"].value = [0, 1, 0, 0];
            this.updateInternal(this.updateImageMapShader, splitNbIterations, this.internalTextures[1]);
            this.updateImageMapShader.u["uSampledChannel"].value = [0, 0, 1, 0];
            this.updateInternal(this.updateImageMapShader, splitNbIterations, this.internalTextures[2]);
        }
    }

    updateInternal(shader, nbIterations, texture) {
        gl.bindVertexArray(this.vao);
        for (let i = nbIterations; i > 0; i--) {
            texture.swap();
            gl.bindFramebuffer(gl.FRAMEBUFFER, texture.currentFramebuffer);
            shader.u["uPI"].value = texture.previous;
            shader.bindUniforms();
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        }
        gl.bindVertexArray(null);
        this.iteration = this._iteration + nbIterations;
    }

    clearInternalTextures() {
        if (this.resetShader) {
            gl.bindVertexArray(this.vao);
            const pattern = config.initState;
            this.resetShader.u["uPat"].value = [pattern === "starter", 0];
            this.resetShader.use();
            this.resetShader.bindUniformsAndAttributes();
            for (const texture of this.internalTextures) {
                gl.bindFramebuffer(gl.FRAMEBUFFER, texture.currentFramebuffer);
                gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
            }
            gl.bindVertexArray(null);
            return true;
        }
        return false;
    }

    adjustInternalTextureSize() {
        let neededWidth = this.targetWidth;
        let neededHeight = this.targetHeight;
        if (config.interface === "image") {
            const canvasAspectRatio = this.targetWidth / this.targetHeight;
            const imageAspectRatio = getTexture().width / getTexture().height;
            if (canvasAspectRatio > imageAspectRatio) {
                neededWidth = Math.ceil(imageAspectRatio / canvasAspectRatio * this.targetWidth);
            } else if (canvasAspectRatio < imageAspectRatio) {
                neededHeight = Math.ceil(canvasAspectRatio / imageAspectRatio * this.targetHeight);
            }
        }
        if (this.internalTextures[0].width !== neededWidth || this.internalTextures[0].height !== neededHeight) {
            for (const texture of this.internalTextures) {
                texture.reserveSpace(neededWidth, neededHeight);
            }
            return true;
        }
        return false;
    }

    set iteration(i) {
        this._iteration = i;
        const now = performance.now();
        if (now - this.lastIterationUpdate > 200) {
            this.lastIterationUpdate = now;
        }
    }

    computeNbIterationsForThisFrame() {
        const nbIterationsPerFrameAt60FPS = config.speed;
        const MAX_FPS = 60;
        const MIN_FPS = 10;
        const now = performance.now();
        const instantFPS = 1000 / (0.1 + now - this.lastUpdateTimestamp);
        this.lastUpdateTimestamp = now;
        if (instantFPS > MAX_FPS) {
            return Math.ceil(MAX_FPS / instantFPS * nbIterationsPerFrameAt60FPS);
        } else if (instantFPS < MIN_FPS) {
            return Math.ceil(instantFPS / MIN_FPS * nbIterationsPerFrameAt60FPS);
        }
        return nbIterationsPerFrameAt60FPS;
    }

    asyncLoadShader(name, vertexSource, fragmentSource, callback, injected = {}) {
        buildShader({
            fragmentSource,
            vertexSource,
            injected,
        }, (builtShader) => {
            if (builtShader !== null) {
                builtShader.a["co"].VBO = this.squareVBO;
                callback(builtShader);
            } else {
                console.error(`Failed to build '${name}' shader.`);
            }
        });
    }
}

ReactionDiffusion.FEED_MIN = 0.01;
ReactionDiffusion.FEED_MAX = 0.1;
ReactionDiffusion.KILL_MIN = 0.045;
ReactionDiffusion.KILL_MAX = 0.07;
ReactionDiffusion.uInvert = config.invert;

function buildShader({ vertexSource, fragmentSource, injected }, callback) {
    const processedVert = vertexSource ? vertexSource.replace(/#INJECT\(([^)]*)\)/mg, (match, name) => {
        return injected[name] || match;
    }) : null;

    const processedFrag = fragmentSource ? fragmentSource.replace(/#INJECT\(([^)]*)\)/mg, (match, name) => {
        return injected[name] || match;
    }) : null;

    let shader = null;
    if (processedVert && processedFrag) {
        shader = new ShaderProgram(gl, processedVert, processedFrag);
    }
    callback(shader);
}

let currentTexture = null;

function getTexture() {
    if (currentTexture === null) {
        currentTexture = new ImageTexture(new ImageData(new Uint8ClampedArray([0, 0, 0, 255]), 1, 1));
    }
    return currentTexture;
}

class ImageTexture {
    constructor(source) {
        this._width = source.width || -1;
        this._height = source.height || -1;
        this.id = gl.createTexture();
        this.uploadToGPU(source);
    }

    uploadToGPU(source) {
        if (!source) {
            console.error("Invalid source provided to uploadToGPU");
            return;
        }

        this._width = source.width || source.videoWidth || -1;
        this._height = source.height || source.videoHeight || -1;

        if (this._width <= 0 || this._height <= 0) {
            console.error("Invalid dimensions for texture source", { width: this._width, height: this._height });
            return;
        }

        gl.bindTexture(gl.TEXTURE_2D, this.id);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

        try {
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
        } catch (error) {
            console.error("Error uploading texture to GPU", error);
        }

        gl.bindTexture(gl.TEXTURE_2D, null);
    }

    get width() {
        return this._width;
    }

    get height() {
        return this._height;
    }
}

function initControls() {
    const gui = new dat.GUI({ autoPlace: false });
    const guiContainer = document.querySelector("#gui");
    guiContainer.appendChild(gui.domElement);

    guiContainer.style.position = 'absolute';
    guiContainer.style.top = '10px';
    guiContainer.style.right = '10px';
    guiContainer.style.zIndex = '1000';

    gui.add(config, 'zoom', 0.1, 5).onChange(value => {
        config.zoom = value;
    });

    gui.add(config, 'speed', 1, 120).step(1).onChange(value => {
        config.speed = value;
    });

    gui.add(config, 'contrast', 0, 100).step(1).onChange(value => {
        config.contrast = value;
    });

    gui.add(config, 'randomPatternScale', 0.1, 5.3).onChange(value => {
        config.randomPatternScale = value;
    });

    gui.add(config, 'edgeInfluence', -1, 1).step(0.01).onChange(value => {
        config.edgeInfluence = value;
    });

    gui.add(config, 'brightnessInfluence', -1, 1).step(0.01).onChange(value => {
        config.brightnessInfluence = value;
    });

    gui.add(config, 'invert').onChange(value => {
        config.invert = value ? 1 : 0;
        document.body.style.backgroundColor = config.invert === 1 ? 'white' : 'black';
    });

    gui.add(config, 'brushSize', 0.001, 0.1).onChange(value => {
        config.brushSize = value;
    });

    gui.add(config, 'brushStrength', 0, 1).onChange(value => {
        config.brushStrength = value;
    });

    const cameraFolder = gui.addFolder('Camera');
    cameraFolder.add(config, 'zoomCam', 0.5, 2).step(0.1).onChange(value => {
        config.zoomCam = value;
        if (cameraInput) {
            cameraInput.setZoom(value);
        }
    });
    
    cameraFolder.open();

    return gui;
}

async function main() {
    const webglFlags = {
        alpha: false,
        antialias: false,
        depth: false,
        stencil: false,
        preserveDrawingBuffer: false,
    };

    gl = canvas.getContext("webgl2", webglFlags);
    if (!gl) {
        console.error("Unable to create WebGL 2.0 context. Your browser may not support it.");
        return;
    }

    gl.clearColor(1.0, 1.0, 1.0, 1.0);
    gl.disable(gl.CULL_FACE);
    gl.disable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.STENCIL_TEST);

    let needToAdjustCanvasSize = true;

    const ReDiff = new ReactionDiffusion();
    canvas.width = config.canvasWidth;
    canvas.height = config.canvasHeight;

    const scale = Math.min(window.innerWidth / config.canvasWidth, window.innerHeight / config.canvasHeight);
    canvas.style.width = `${config.canvasWidth * scale}px`;
    canvas.style.height = `${config.canvasHeight * scale}px`;

    getTexture();

    function mainLoop() {
        if (needToAdjustCanvasSize) {
            adjustSize();
            ReDiff.resize(canvas.width, canvas.height);
            needToAdjustCanvasSize = false;
        }
    
        updateTexture(); // Add this line to update the texture from the camera
    
        ReDiff.updateImageMapShader.u["uDiffuseScaling"].value = config.randomPatternScale;
        ReDiff.updateImageMapShader.u["uEdgeInfluence"].value = config.edgeInfluence;
        ReDiff.updateImageMapShader.u["uBrightnessInfluence"].value = config.brightnessInfluence;
    
        ReDiff.update();
        ReDiff.drawToCanvas();
    
        requestAnimationFrame(mainLoop);
    }

    initControls();
    mainLoop();
}

main().catch(console.error);