import * as dat from 'dat.gui';


// document.addEventListener('DOMContentLoaded', () => {


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
        in vec2 co; // in {-1,+1}^2
        
        out vec2 vS; // in [0,1]^2  
        void main(void) {
            gl_Position = vec4(co, 0, 1);
            vS = 0.5 + 0.5 * co;
        }
        `,
        resFrag: `#version 300 es        
precision mediump float;
uniform vec2 uPat;

in vec2 vS; // in [0,1]^2
out vec4 fragColor;

${shaderUtils.enDe16}
${shaderUtils.samT}

// Pseudo-random number generator
float random(vec2 st) {
    return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
}

void main() {
    float width = 2160.0;
    float height = 1620.0;
  
    float aspectRatio = width / height;
    
    // Number of dots
    const int numberOfDots = 50;
    
    // Dot parameters
    float dotRadius = 0.005; // Radius of dots
    
    float starter = 0.0; // Initialize starter as not inside any dot
    
    // Loop through the dots
    for(int i = 0; i < numberOfDots; ++i) {
        // Generate random position for each dot
        vec2 dotPos = vec2(
            random(vec2(float(i), 0.12345)),
            random(vec2(float(i), 0.67890))
        );
        
        // Adjust for aspect ratio
        dotPos.x *= aspectRatio;
        
        // Check if current fragment is inside the dot
        float distToDot = distance(vS * vec2(aspectRatio, 1.0), dotPos);
        if(distToDot < dotRadius) {
            starter = 1.0;
            break; // Exit loop if inside a dot
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
    
        vec4 computeNewValue(float feedA, float killB, float diffA, float diffB) {
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
        
        // Calculate brightness and edge intensity
        float brightness = luminance(sampledColor.rgb);
        float edge = detectEdges(uImageMapTexture, vS, uTex);
        
        // Adjust mapValue based on brightness and edge intensity
        mapValue = mix(mapValue, 1.0, brightness * uBrightnessInfluence);
        mapValue = mix(mapValue, 1.0, edge * uEdgeInfluence);
        
        float aspectRatio = uResolution.x / uResolution.y;


        vec2 brushPos = uBrushPosition;
        brushPos.x *= aspectRatio;
        vec2 pixelPos = vS;
        pixelPos.x *= aspectRatio;
        float distToBrush = distance(pixelPos, brushPos) / aspectRatio;
        float brushInfluence = smoothstep(uBrushSize, uBrushSize - 0.001, distToBrush);


        
        
        // Inject new material with the brush
        A = mix(A, 1.0, brushInfluence * uBrushStrength);
        B = mix(B, 1.0, brushInfluence * uBrushStrength);

        // Adjust feed and kill rates based on brightness and edge intensity
        float feedA = mix(0.02220, 0.04470, mapValue);
        float killB = mix(0.06516, 0.05789, mapValue);
        
        // Make patterns finer in brighter areas and along edges
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
        
        in vec2 vS; // in [0,1]^2
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

    let canvas = document.createElement("canvas");
    document.documentElement.appendChild(canvas);

    scaleCanvasToWindowSize(canvas, 2160, 1620);

    function scaleCanvasToWindowSize(canvas, targetWidth, targetHeight) {
        const scaleX = window.innerWidth / targetWidth;
        const scaleY = window.innerHeight / targetHeight;
        const scaleToFit = Math.min(scaleX, scaleY);
        canvas.style.width = `${targetWidth * scaleToFit}px`;
        canvas.style.height = `${targetHeight * scaleToFit}px`;
    }

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
            if (error.name) {
                console.error('Error name:', error.name);
            }
            if (error.message) {
                console.error('Error message:', error.message);
            }
            return null;
        }
    }

    let gl = null;
    function initGL(flags) {
        gl = canvas.getContext("webgl2", flags);
        if (gl == null) {
            gl = canvas.getContext("experimental-webgl", flags);
            if (gl == null) {
                setError("Your browser or device does not seem to support WebGL.");
                return false;
            }
            setError(`Your browser or device only supports experimental WebGL.
The simulation may not run as expected.`);
        }
        gl.disable(gl.CULL_FACE);
        gl.disable(gl.DEPTH_TEST);
        gl.disable(gl.BLEND);
        gl.clearColor(1, 1, 1, 1);
        return true;
    }

    function adjustSize(hidpi = false) {
        const canvas = gl.canvas;
        const width = 2160;
        const height = 1620;
        console.log(`Canvas size: ${width}x${height}`);
        console.log(`CSS size: ${canvas.clientWidth}x${canvas.clientHeight}`);
        console.log(`Device pixel ratio: ${window.devicePixelRatio}`);
        console.log(`window.width: ${window.innerWidth}`);
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


    function bindUniformFloat(gl, location, value) {
        if (Array.isArray(value)) {
            gl.uniform1fv(location, value);
        } else {
            gl.uniform1f(location, value);
        }
    }

    function bindUniformFloat2v(gl, location, value) {
        gl.uniform2fv(location, value);
    }

    function bindUniformFloat3v(gl, location, value) {
        gl.uniform3fv(location, value);
    }

    function bindUniformFloat4v(gl, location, value) {
        gl.uniform4fv(location, value);
    }

    function bindUniformInt(gl, location, value) {
        if (Array.isArray(value)) {
            gl.uniform1iv(location, value);
        } else {
            gl.uniform1i(location, value);
        }
    }

    function bindUniformInt2v(gl, location, value) {
        gl.uniform2iv(location, value);
    }

    function bindUniformInt3v(gl, location, value) {
        gl.uniform3iv(location, value);
    }

    function bindUniformInt4v(gl, location, value) {
        gl.uniform4iv(location, value);
    }

    function bindUniformBool(gl, location, value) {
        gl.uniform1i(location, value ? 1 : 0);
    }

    function bindUniformBoolv(gl, location, value) {
        gl.uniform1iv(location, value.map(v => v ? 1 : 0));
    }

    function bindUniformMatrix2fv(gl, location, value) {
        gl.uniformMatrix2fv(location, false, value);
    }

    function bindUniformMatrix3fv(gl, location, value) {
        gl.uniformMatrix3fv(location, false, value);
    }

    function bindUniformMatrix4fv(gl, location, value) {
        gl.uniformMatrix4fv(location, false, value);
    }

    function bindSampler2D(gl, location, unitNb, value) {
        gl.uniform1i(location, unitNb);
        gl.activeTexture(gl["TEXTURE" + unitNb]);
        gl.bindTexture(gl.TEXTURE_2D, value);
    }

    // Updated types object
    const types = {
        0x8B50: { str: "FLOAT_VEC2", binder: bindUniformFloat2v },
        0x8B51: { str: "FLOAT_VEC3", binder: bindUniformFloat3v },
        0x8B52: { str: "FLOAT_VEC4", binder: bindUniformFloat4v },
        0x8B53: { str: "INT_VEC2", binder: bindUniformInt2v },
        0x8B54: { str: "INT_VEC3", binder: bindUniformInt3v },
        0x8B55: { str: "INT_VEC4", binder: bindUniformInt4v },
        0x8B56: { str: "BOOL", binder: bindUniformBool },
        0x8B57: { str: "BOOL_VEC2", binder: bindUniformBoolv },
        0x8B58: { str: "BOOL_VEC3", binder: bindUniformBoolv },
        0x8B59: { str: "BOOL_VEC4", binder: bindUniformBoolv },
        0x8B5A: { str: "FLOAT_MAT2", binder: bindUniformMatrix2fv },
        0x8B5B: { str: "FLOAT_MAT3", binder: bindUniformMatrix3fv },
        0x8B5C: { str: "FLOAT_MAT4", binder: bindUniformMatrix4fv },
        0x8B5E: { str: "SAMPLER_2D", binder: bindSampler2D },
        0x8B60: { str: "SAMPLER_CUBE", binder: bindSampler2D },
        0x1404: { str: "INT", binder: bindUniformInt },
        0x1406: { str: "FLOAT", binder: bindUniformFloat },
    };

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

        freeGLResources() {
            this.gl().deleteProgram(this.id);
            this.id = null;
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
        freeGLResources() {
            this.gl().deleteBuffer(this.id);
            this.id = null;
        }
        bind(location) {
            const gl = super.gl();
            gl.enableVertexAttribArray(location);
            gl.bindBuffer(gl.ARRAY_BUFFER, this.id);
            gl.vertexAttribPointer(location, this.size, this.type, this.normalize, this.stride, this.offset);
        }
        setData(array) {
            const gl = super.gl();
            gl.bindBuffer(gl.ARRAY_BUFFER, this.id);
            if (this.usage === Usage.STATIC) {
                gl.bufferData(gl.ARRAY_BUFFER, array, gl.STATIC_DRAW);
            }
            else {
                gl.bufferData(gl.ARRAY_BUFFER, array, gl.DYNAMIC_DRAW);
            }
            gl.bindBuffer(gl.ARRAY_BUFFER, null);
        }
    }

    const loadingObjects = {};
    function registerLoadingObject(id) {
        if (Object.keys(loadingObjects).length === 0) {

        }
        loadingObjects[id] = false;
    }
    function registerLoadedObject(id) {
        delete loadingObjects[id];
        if (Object.keys(loadingObjects).length === 0) {

        }
    }
    const queryParams = new URLSearchParams(window.location.search);

    const patternSplit = 7 // R.random_choice([7, 9, 11]);
    const invert = 1 //R.random_choice([0, 1]);
    const chaos = 1 //R.random_choice([0, 1]);

    const config = {
        aspectRatio: 4 / 3,
        canvasWidth: 1024,
        randomPatternScale: 5,
        zoom: queryParams.has('z') ? parseFloat(queryParams.get('z')) : 1,
        interface: "image",
        initState: "starter",
        maxResolution: 8,
        invert: 1,
        speed: 60,
        patternSplit: patternSplit,
        chaos: chaos,
        contrast: 75,
        zoomCam: 2.0,
        edgeInfluence: 0.0,
        brightnessInfluence: 0.0,
        patternScale: 4,
        brushSize: 0.01,
        brushStrength: 1.0,
        
    };

    if (config.invert === 1) {
        document.body.style.backgroundColor = 'white';
    } else {
        document.body.style.backgroundColor = 'black';
    }

    console.log(`invert: ${config.invert}`);
    console.log(`randomPatternScale: ${config.randomPatternScale}`);
    console.log(`zoom: ${config.zoom}`);

    const imageUploadObservers = [];
    const imageDownloadObservers = [];
    const canvasResizeObservers = [];
    const resetObservers = [];

    config.canvasHeight = Math.round(config.canvasWidth / config.aspectRatio);

    async function setupCameraInput() {
        console.log("Setting up camera input");
        try {
            const video = await setupCamera();
            console.log("Camera setup complete. Video element:", video);

            if (!video) {
                throw new Error("Failed to set up camera: video element is null");
            }

            const canvas = document.createElement('canvas');
            canvas.width = config.canvasWidth;
            canvas.height = config.canvasHeight;
            const ctx = canvas.getContext('2d');

            let currentZoom = config.zoomCam;

            function adjustContrast(canvas, contrast) {
                const ctx = canvas.getContext('2d');
                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const data = imageData.data;

                const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));

                for (let i = 0; i < data.length; i += 4) {
                    data[i] = factor * (data[i] - 128) + 128;
                    data[i + 1] = factor * (data[i + 1] - 128) + 128;
                    data[i + 2] = factor * (data[i + 2] - 128) + 128;
                }

                ctx.putImageData(imageData, 0, 0);
            }

            function setZoom(zoom) {
                currentZoom = Math.max(0.1, zoom);
            }

            function captureVideoFrame() {
                if (!video.videoWidth || !video.videoHeight) {
                    console.log("Video dimensions not available yet");
                    return null;
                }
            
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
            
                let zoomedSW, zoomedSH;
                if (currentZoom >= 1) {
                    zoomedSW = sw / currentZoom;
                    zoomedSH = sh / currentZoom;
                    sx += (sw - zoomedSW) / 2;
                    sy += (sh - zoomedSH) / 2;
                } else {
                    zoomedSW = sw / currentZoom;
                    zoomedSH = sh / currentZoom;
                    sx -= (zoomedSW - sw) / 2;
                    sy -= (zoomedSH - sh) / 2;
                }
                sw = zoomedSW;
                sh = zoomedSH;
            
                ctx.save();
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.scale(-1, -1);
                ctx.translate(-canvas.width, -canvas.height);
                ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
            
                if (config.invert) {
                    ctx.globalCompositeOperation = 'difference';
                    ctx.fillStyle = 'white';
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                }
            
                ctx.restore();
            
                adjustContrast(canvas, config.contrast);
            
                return canvas;
            }

            console.log("Camera input setup complete");
            return {
                video,
                captureVideoFrame,
                setZoom
            };
        } catch (error) {
            console.error("Detailed error in setupCameraInput:", error);
            if (error.name) {
                console.error('Error name:', error.name);
            }
            if (error.message) {
                console.error('Error message:', error.message);
            }
            // Display an error message to the user
            displayErrorMessage("Camera access is not available. Please check your browser settings and ensure you're using a secure connection (HTTPS).");
            return null;
        }
    }

    let cameraInput;
    setupCameraInput().then(input => {
        cameraInput = input;
        if (cameraInput) {
            console.log("Camera input successfully set up");
            for (const observer of imageUploadObservers) {
                observer(cameraInput.video);
            }
        } else {
            console.error('Failed to set up camera input');
            // The error message is already displayed by displayErrorMessage
        }
    }).catch(error => {
        console.error('Unexpected error in setupCameraInput:', error);
        displayErrorMessage("An unexpected error occurred while setting up the camera.");
    });

    function buildDefaultImageData() {
        const v = 0;
        try {
            return new ImageData(new Uint8ClampedArray([v, v, v, v]), 1, 1);
        }
        catch (_a) {
            console.log("Failed to create default ImageData from constructor, using Canvas2D instead...");
            const hiddenCanvas = document.createElement("canvas");
            const context = hiddenCanvas.getContext("2d");
            const result = context.createImageData(1, 1);
            for (let i = 0; i < result.data.length; i++) {
                result.data[i] = v;
            }
            return result;
        }
    }

    const defaultImageData = buildDefaultImageData();

    class ImageTexture {
        constructor(source) {
            this._width = -1;
            this._height = -1;
            this.id = gl.createTexture();
            this.uploadToGPU(source !== null && source !== void 0 ? source : defaultImageData);
        }

        uploadToGPU(source) {
            if (!source) {
                console.error("Invalid source provided to uploadToGPU");
                return;
            }

            this._width = source.width || source.videoWidth || -1;
            this._height = source.height || source.videoHeight || -1;

            // console.log(`Uploading texture to GPU. Dimensions: ${this._width}x${this._height}`);

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

    function updateTexture() {
        // console.log("Entering updateTexture");
        if (!cameraInput) {
            console.log("No camera input available");
            return;
        }

        try {
            if (currentTexture === null) {
                console.log("Creating new texture");
                currentImageData = downsizeImageIfNeeded(cameraInput.video);
                if (currentImageData) {
                    console.log(`Current image data dimensions: ${currentImageData.width}x${currentImageData.height}`);
                    currentTexture = new ImageTexture(currentImageData);
                } else {
                    console.error("Failed to create currentImageData");
                    return;
                }
            } else {
                // console.log("Updating existing texture");
                const flippedFrame = cameraInput.captureVideoFrame();
                if (flippedFrame) {
                    // console.log(`Flipped frame dimensions: ${flippedFrame.width}x${flippedFrame.height}`);
                    currentTexture.uploadToGPU(flippedFrame);
                } else {
                    console.error("Failed to capture video frame");
                }
            }

            if (currentTexture) {
                // console.log(`Current texture dimensions: ${currentTexture.width}x${currentTexture.height}`);
            }
        } catch (error) {
            console.error("Error in updateTexture:", error);
            console.trace();
        }
    }

    const maxResolution = config.maxResolution;
    const hiddenCanvas = document.createElement("canvas");
    const hiddenCanvasContext = hiddenCanvas.getContext("2d");
    let currentImageData;
    let currentTexture = null;
    function computeBrightness(r, g, b) {
        return (0.21 * r) + (0.72 * g) + (0.07 * b);
    }
    function downsizeImageIfNeeded(source) {
        const width = source.videoWidth || source.width;
        const height = source.videoHeight || source.height;
        const scalingFactor = Math.min(1, maxResolution / Math.max(width, height));
        const finalWidth = Math.ceil(scalingFactor * width);
        const finalHeight = Math.ceil(scalingFactor * height);

        hiddenCanvas.width = finalWidth;
        hiddenCanvas.height = finalHeight;

        hiddenCanvasContext.save();
        hiddenCanvasContext.scale(1, -1);
        hiddenCanvasContext.translate(0, -finalHeight);
        hiddenCanvasContext.drawImage(source, 0, 0, finalWidth, finalHeight);
        hiddenCanvasContext.restore();

        const imageData = hiddenCanvasContext.getImageData(0, 0, hiddenCanvas.width, hiddenCanvas.height);
        const rawDataCopy = new Uint8ClampedArray(imageData.data);

        let i = 0;
        for (let iY = imageData.height - 1; iY >= 0; iY--) {
            for (let iX = 0; iX < imageData.width; iX++) {
                const r = rawDataCopy[4 * (iX + iY * imageData.width)];
                const g = rawDataCopy[4 * (iX + iY * imageData.width) + 1];
                const b = rawDataCopy[4 * (iX + iY * imageData.width) + 2];
                const brightness = computeBrightness(r, g, b);
                imageData.data[i++] = r;
                imageData.data[i++] = g;
                imageData.data[i++] = b;
                imageData.data[i++] = brightness;
            }
        }
        return imageData;
    }
    imageUploadObservers.push((image) => {
        currentImageData = downsizeImageIfNeeded(image);
        if (currentTexture !== null) {
            currentTexture.uploadToGPU(currentImageData);
        }
    });
    function getTexture() {
        if (currentTexture === null) {
            currentTexture = new ImageTexture(defaultImageData);
        }
        return currentTexture;
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
            const tmp = this.currentTexture;
            this.currentTexture = this.previousTexture;
            this.previousTexture = tmp;
        }
    }


    function initControls() {
        const gui = new dat.GUI({ autoPlace: false });
        const guiContainer = document.querySelector("#gui");
        guiContainer.appendChild(gui.domElement);
    
        // Style the GUI container
        guiContainer.style.position = 'absolute';
        guiContainer.style.top = '10px';
        guiContainer.style.right = '10px';
        guiContainer.style.zIndex = '1000';  // Ensure it's on top of other elements
    
        // Add controls
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
            console.log('Zoom changed:', value); // Add this line for debugging
        });
        
        cameraFolder.open();
    
        return gui;
    }

    // Call this function after your canvas is set up
    // initControls();

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

        startDrawing(e) {
            this.brush.isDrawing = true;
            this.updateBrushPosition(e);
        }

        draw(e) {
            if (this.brush.isDrawing) {
                this.updateBrushPosition(e);
            }
        }

        stopDrawing() {
            this.brush.isDrawing = false;
        }

        updateBrushPosition(e) {
            const rect = gl.canvas.getBoundingClientRect();
            const x = (e.clientX - rect.left) / rect.width;
            const y = 1 - (e.clientY - rect.top) / rect.height; // Flip Y-coordinate
            this.brush.position = [x, y];
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

                // Pass canvas resolution for aspect ratio correction
                this.updateImageMapShader.u["uResolution"].value = [this.targetWidth, this.targetHeight];

                // Always pass brush information
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
            const id = `shader-${name}`;
            registerLoadingObject(id);
            buildShader({
                fragmentSource,
                vertexSource,
                injected,
            }, (builtShader) => {
                registerLoadedObject(id);
                if (builtShader !== null) {
                    builtShader.a["co"].VBO = this.squareVBO;
                    callback(builtShader);
                } else {
                    console.error(`Failed to build '${name}' shader.`);
                    console.error('Vertex Shader:');
                    console.error(vertexSource);
                    console.error('Fragment Shader:');
                    console.error(fragmentSource);
                }
            });
        }
    }

    ReactionDiffusion.FEED_MIN = 0.01;
    ReactionDiffusion.FEED_MAX = 0.1;
    ReactionDiffusion.KILL_MIN = 0.045;
    ReactionDiffusion.KILL_MAX = 0.07;
    ReactionDiffusion.uInvert = config.invert;

    async function main() {
        const webglFlags = {
            alpha: false,
            antialias: false,
            depth: false,
            stencil: false,
            preserveDrawingBuffer: false,
        };

        // Create WebGL 2.0 context
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
        canvasResizeObservers.push(() => { needToAdjustCanvasSize = true; });

        const ReDiff = new ReactionDiffusion();
        canvas.width = config.canvasWidth;
        canvas.height = config.canvasHeight;

        const scale = Math.min(window.innerWidth / config.canvasWidth, window.innerHeight / config.canvasHeight);
        canvas.style.width = `${config.canvasWidth * scale}px`;
        canvas.style.height = `${config.canvasHeight * scale}px`;

        // Initialize texture
        getTexture();

        function mainLoop() {
            updateTexture();


            if (needToAdjustCanvasSize) {
                adjustSize(false);
                ReDiff.resize(canvas.width, canvas.height);
                needToAdjustCanvasSize = false;
            }

            // Apply updated config values
            ReDiff.updateImageMapShader.u["uDiffuseScaling"].value = config.randomPatternScale;
            ReDiff.updateImageMapShader.u["uEdgeInfluence"].value = config.edgeInfluence;
            ReDiff.updateImageMapShader.u["uBrightnessInfluence"].value = config.brightnessInfluence;

            if (cameraInput) {
                cameraInput.setZoom(config.zoomCam);
            }

            ReDiff.update();
            ReDiff.drawToCanvas();

            requestAnimationFrame(mainLoop);
        }
        initControls();

        mainLoop();
    }

    main().catch(console.error);

// });
