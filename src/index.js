import * as dat from 'dat.gui';

const canvas = document.createElement("canvas");
document.documentElement.appendChild(canvas);

let ReDiff;


const config = {
    aspectRatio: 4 / 3,
    canvasWidth: 1024,
    randomPatternScale: 5,
    zoom: 1.1,
    zoomCam: 1.3,               
    interface: "image",
    initState: "starter",
    maxResolution: 8,
    invert: 0,
    speed: 60,
    patternSplit: 7,
    contrast: 75,
    chunkiness: 1,

    edgeInfluence: -0.09,
    brightnessInfluence: 0.0,
    patternScale: 4,
    brushSize: 0.01,
    brushStrength: 1.0,
    threshold: 128,
    diffA: 0.210,
    diffB: 0.105,
    feedAMin: 0.02220,
    feedAMax: 0.04470,
    killBMin: 0.06516,
    killBMax: 0.05789,
    preset: 'OG',
    
    // Per-channel algorithm settings
    algorithmC: 'OG',           // Cyan channel algorithm
    algorithmM: 'OG',           // Magenta channel algorithm
    algorithmY: 'OG',           // Yellow channel algorithm
    algorithmK: 'OG',       // Key (Black) channel algorithm
    enablePerChannelAlgorithms: true, // Toggle for per-channel vs global
    patternSharpness: 40.0,      // Sharpness for the final pattern sharpening
    patternThreshold: 0.23,       // Threshold for the final pattern sharpening
    
    noiseScale: 1.0,
    noiseStrength: 0,
    noiseSpeed: 0,
    colorR: [255, 0, 0],    // Red channel color (0-255)
    colorG: [0, 255, 0],    // Green channel color (0-255)
    colorB: [0, 0, 255],    // Blue channel color (0-255)
    colorMix: 0.5,
    audioReactive: false,
    audioStrengthInfluence: 0.02,
    audioSpeedInfluence: 0.02,
    audioSensitivity: 1.0,
};

const presets = {
    'OG': {
        diffA: 0.210, diffB: 0.105,
        feedAMin: 0.02220, feedAMax: 0.04470,
        killBMin: 0.06516, killBMax: 0.05789
    },
    'Classic': {
        diffA: 0.2097, diffB: 0.1050,
        feedAMin: 0.0367, feedAMax: 0.0649,
        killBMin: 0.0649, killBMax: 0.0591
    },
    'Classic Spots': {
        diffA: 0.2100, diffB: 0.1000,
        feedAMin: 0.0370, feedAMax: 0.0620,
        killBMin: 0.0620, killBMax: 0.0609
    },
    'Classic Stripes': {
        diffA: 0.2000, diffB: 0.1000,
        feedAMin: 0.0390, feedAMax: 0.0650,
        killBMin: 0.0590, killBMax: 0.0620
    },
    'Classic Fine': {
        diffA: 0.2150, diffB: 0.1075,
        feedAMin: 0.0350, feedAMax: 0.0630,
        killBMin: 0.0630, killBMax: 0.0580
    },
    'Classic Maze': {
        diffA: 0.2000, diffB: 0.1000,
        feedAMin: 0.0300, feedAMax: 0.0550,
        killBMin: 0.0550, killBMax: 0.0620
    },
    'Coral': {
        diffA: 0.1, diffB: 0.05,
        feedAMin: 0.054, feedAMax: 0.064,
        killBMin: 0.062, killBMax: 0.06
    },
    'Mitosis': {
        diffA: 0.25, diffB: 0.125,
        feedAMin: 0.03, feedAMax: 0.08,
        killBMin: 0.06, killBMax: 0.07
    },
    'Fingerprint': {
        diffA: 0.2, diffB: 0.1,
        feedAMin: 0.029, feedAMax: 0.057,
        killBMin: 0.057, killBMax: 0.063
    },
    'Fluid': {
        diffA: 0.25, diffB: 0.15,
        feedAMin: 0.03, feedAMax: 0.09,
        killBMin: 0.056, killBMax: 0.062
    },
    'Detailed': {
        diffA: 0.18, diffB: 0.09,
        feedAMin: 0.022, feedAMax: 0.051,
        killBMin: 0.051, killBMax: 0.064
    },
    'Detailed Bright': {
        diffA: 0.16, diffB: 0.08,
        feedAMin: 0.020, feedAMax: 0.048,
        killBMin: 0.048, killBMax: 0.060
    },
    'Detailed Balanced': {
        diffA: 0.17, diffB: 0.085,
        feedAMin: 0.030, feedAMax: 0.055,
        killBMin: 0.055, killBMax: 0.062
    },
    'Waves': {
        diffA: 0.21, diffB: 0.11,
        feedAMin: 0.039, feedAMax: 0.058,
        killBMin: 0.059, killBMax: 0.061
    },
    'Maze': {
        diffA: 0.19, diffB: 0.09,
        feedAMin: 0.037, feedAMax: 0.06,
        killBMin: 0.059, killBMax: 0.065
    },
    'Chunky': {
        diffA: 0.4, diffB: 0.2,
        feedAMin: 0.04, feedAMax: 0.07,
        killBMin: 0.05, killBMax: 0.065
    }
};

let audioContext;
let analyser;
let audioSource;
let dataArray;

async function setupAudio() {
    try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        const bufferLength = analyser.frequencyBinCount;
        dataArray = new Uint8Array(bufferLength);

        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioSource = audioContext.createMediaStreamSource(stream);
        audioSource.connect(analyser);

        console.log("Audio setup successful");
    } catch (error) {
        console.error("Error setting up audio:", error);
    }
}

function mapNoiseStrength(audioData) {
    // Use the average of the lower frequencies (bass)
    const bassRange = audioData.slice(0, 10);
    const bassAverage = bassRange.reduce((a, b) => a + b, 0) / bassRange.length;
    // Map the bass average (0-255) to noiseStrength range (0-0.2)
    return Math.min((bassAverage / 255) * 0.2, 0.2);
}

function mapNoiseSpeed(audioData) {
    // Detect beats by looking at energy in a specific frequency range
    const beatRange = audioData.slice(5, 15);
    const beatEnergy = beatRange.reduce((a, b) => a + b, 0) / beatRange.length;
    // Map beat energy (0-255) to noiseSpeed range (0-0.2)
    return (beatEnergy / 255) * 0.2;
}

function normalizeColor(color) {
    return color.map(c => c / 255);
}

// Helper functions for per-channel algorithm parameters
function getChannelParams(channel) {
    if (!config.enablePerChannelAlgorithms) {
        // Use global parameters
        return {
            diffA: config.diffA,
            diffB: config.diffB,
            feedAMin: config.feedAMin,
            feedAMax: config.feedAMax,
            killBMin: config.killBMin,
            killBMax: config.killBMax
        };
    }
    
    // Use per-channel algorithm presets
    let algorithmName;
    switch(channel) {
        case 'C': algorithmName = config.algorithmC; break;
        case 'M': algorithmName = config.algorithmM; break;
        case 'Y': algorithmName = config.algorithmY; break;
        case 'K': algorithmName = config.algorithmK; break;
        default: algorithmName = config.preset;
    }
    
    return presets[algorithmName] || presets[config.preset];
}

function getChannelDiffRates(channel) {
    const params = getChannelParams(channel);
    return [params.diffA, params.diffB];
}

function getChannelFeedKillRates(channel) {
    const params = getChannelParams(channel);
    return [params.feedAMin, params.feedAMax, params.killBMin, params.killBMax];
}

function saveCanvasAsImage() {
    // Create a temporary canvas to draw the WebGL content
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;
    const tempCtx = tempCanvas.getContext('2d');

    // Draw the WebGL canvas content to the temporary canvas
    tempCtx.drawImage(canvas, 0, 0, canvas.width, canvas.height);

    // Convert the canvas to a data URL
    const dataURL = tempCanvas.toDataURL('image/png');

    // Create a link element and trigger the download
    const link = document.createElement('a');
    link.href = dataURL;
    link.download = 'reaction_diffusion_' + Date.now() + '.png';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function splitAndSaveCMYKChannels() {
    if (!ReDiff || !ReDiff.displaySingleChannelShader) {
        console.error("Single channel display shader not ready.");
        return;
    }

    // Create a temporary canvas to draw the WebGL content to
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;
    const tempCtx = tempCanvas.getContext('2d');

    const channelNames = ['cyan', 'magenta', 'yellow', 'black'];
    const shader = ReDiff.displaySingleChannelShader;

    gl.bindVertexArray(ReDiff.vao);
    shader.use();
    
    const canvasAspectRatio = ReDiff.targetWidth / ReDiff.targetHeight;
    const internalTextureAspectRatio = ReDiff.internalTextures[0].width / ReDiff.internalTextures[0].height;
    shader.u["s"].value = [internalTextureAspectRatio / canvasAspectRatio, 1];
    shader.u["z"].value = config.zoom;
    
    channelNames.forEach((channelName, index) => {
        shader.u["uChannelTexture"].value = ReDiff.internalTextures[index].current;
        
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, ReDiff.targetWidth, ReDiff.targetHeight);
        shader.bindUniformsAndAttributes();
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

        tempCtx.drawImage(canvas, 0, 0, canvas.width, canvas.height);

        const dataURL = tempCanvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.href = dataURL;
        link.download = `reaction_diffusion_${channelName}_${Date.now()}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    });
    
    gl.bindVertexArray(null);

    ReDiff.drawToCanvas();
}

function simplifiedImageTrace(imageData, channel, threshold = 128, sampleInterval = 5) {
    const width = imageData.width;
    const height = imageData.height;
    let paths = [];
    let currentPath = '';

    for (let y = 0; y < height; y += sampleInterval) {
        let isDrawing = false;
        for (let x = 0; x < width; x += sampleInterval) {
            const i = (y * width + x) * 4;
            const value = imageData.data[i + channel];

            if (value < threshold) {
                if (!isDrawing) {
                    currentPath += `M${x},${y}`;
                    isDrawing = true;
                } else {
                    currentPath += `L${x},${y}`;
                }
            } else if (isDrawing) {
                paths.push(currentPath);
                currentPath = '';
                isDrawing = false;
            }
        }
        if (isDrawing) {
            paths.push(currentPath);
            currentPath = '';
        }
    }

    // Vertical paths
    for (let x = 0; x < width; x += sampleInterval) {
        let isDrawing = false;
        for (let y = 0; y < height; y += sampleInterval) {
            const i = (y * width + x) * 4;
            const value = imageData.data[i + channel];

            if (value < threshold) {
                if (!isDrawing) {
                    currentPath += `M${x},${y}`;
                    isDrawing = true;
                } else {
                    currentPath += `L${x},${y}`;
                }
            } else if (isDrawing) {
                paths.push(currentPath);
                currentPath = '';
                isDrawing = false;
            }
        }
        if (isDrawing) {
            paths.push(currentPath);
            currentPath = '';
        }
    }

    return paths;
}

function handleOrientationChange() {
    const orientation = window.orientation;
    const canvas = document.querySelector('canvas');
    
    if (orientation === 90 || orientation === -90) {
        // Landscape
        canvas.style.width = '100vw';
        canvas.style.height = 'auto';
    } else {
        // Portrait
        canvas.style.width = 'auto';
        canvas.style.height = '100vh';
    }
    
    // Trigger a resize event to update the WebGL context
    window.dispatchEvent(new Event('resize'));
}

// Add event listener for orientation change
window.addEventListener('orientationchange', handleOrientationChange);

// Call once on load to set initial orientation
handleOrientationChange();

function createSVGForChannel(imageData, channel, threshold = 128, sampleInterval = 5) {
    const width = imageData.width;
    const height = imageData.height;
    
    const paths = simplifiedImageTrace(imageData, channel, threshold, sampleInterval);
    
    let svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">`;
    svgContent += `<path d="${paths.join(' ')}" fill="none" stroke="black" stroke-width="1" />`;
    svgContent += '</svg>';

    return svgContent;
}

function splitAndSaveColorChannelsAsSVG() {
    // Create a temporary canvas to draw the WebGL content
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;
    const tempCtx = tempCanvas.getContext('2d');

    // Draw the WebGL canvas content to the temporary canvas
    tempCtx.drawImage(canvas, 0, 0, canvas.width, canvas.height);

    // Get the image data
    const imageData = tempCtx.getImageData(0, 0, canvas.width, canvas.height);

    // Create separate SVGs for each color channel
    const channels = ['cyan', 'magenta', 'yellow'];
    channels.forEach((channel, index) => {
        const svgContent = createSVGForChannel(imageData, index);
        
        // Create a Blob with the SVG content
        const blob = new Blob([svgContent], {type: 'image/svg+xml'});
        const url = URL.createObjectURL(blob);

        // Create a download link
        const link = document.createElement('a');
        link.href = url;
        link.download = `reaction_diffusion_${channel}_${Date.now()}.svg`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        // Clean up the URL object
        URL.revokeObjectURL(url);
    });
}

async function setupCamera() {
    const video = document.createElement('video');
    video.setAttribute('playsinline', ''); // This is important for iOS

    try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            throw new Error('Your browser does not support the required media APIs');
        }

        const constraints = {
            video: {
                facingMode: 'user', // Use the front camera for selfies
                width: { ideal: 1280 },
                height: { ideal: 720 }
            }
        };

        console.log('Attempting to get user media...');
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
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
    displayCMYKFrag: `#version 300 es
precision mediump float;
uniform sampler2D uC, uM, uY, uK;
uniform float uPatternSharpness;
uniform float uPatternThreshold;
uniform float uInvert;
in vec2 vS;
out vec4 fragColor;

${shaderUtils.enDe16}
${shaderUtils.samT}

void main() {
    float c = samT(uC, vS);
    float m = samT(uM, vS);
    float y = samT(uY, vS);
    float k = samT(uK, vS);

    // Apply high contrast sharpening
    float halfWidth = 1.0 / (2.0 * uPatternSharpness);
    float edge0 = uPatternThreshold - halfWidth;
    float edge1 = uPatternThreshold + halfWidth;

    c = smoothstep(edge0, edge1, c);
    m = smoothstep(edge0, edge1, m);
    y = smoothstep(edge0, edge1, y);
    k = smoothstep(edge0, edge1, k);

    // CMYK to RGB conversion
    float r = (1.0 - c) * (1.0 - k);
    float g = (1.0 - m) * (1.0 - k);
    float b = (1.0 - y) * (1.0 - k);

    vec3 finalColor = vec3(r, g, b);

    // Final inversion toggle
    finalColor = mix(finalColor, 1.0 - finalColor, uInvert);

    fragColor = vec4(finalColor, 1.0);
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
uniform int uTargetChannel; // 0:C, 1:M, 2:Y, 3:K
uniform float uDiffuseScaling;
uniform float uEdgeInfluence;
uniform float uBrightnessInfluence;
uniform vec2 uBrushPosition;
uniform float uBrushSize;
uniform float uBrushStrength;
uniform vec2 uResolution;
uniform vec2 uDiffRates;
uniform vec4 uFeedKillRates;
uniform float uNoiseScale;
uniform float uNoiseStrength;
uniform float uTime;
uniform float uAspectRatio;



in vec2 vS;
out vec4 fragColor;

// Encoding and decoding functions
float de16(vec2 v) {
    return dot(v, vec2(255.0 / 256.0, 1.0 / 256.0));
}

vec2 en16(float f) {
    f = 255.99 * clamp(f, 0.0, 1.0);
    return vec2(floor(f) / 255.0, fract(f));
}

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

// Luminance function
float luminance(vec3 color) {
    return dot(color, vec3(0.299, 0.587, 0.114));
}

// Edge detection function
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

// Kernel function for Laplacian
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

// Simplex 3D Noise
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v) {
    const vec2 C = vec2(1.0/6.0, 1.0/3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

    // First corner
    vec3 i  = floor(v + dot(v, C.yyy));
    vec3 x0 =   v - i + dot(i, C.xxx);

    // Other corners
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);

    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;

    // Permutations
    i = mod289(i);
    vec4 p = permute(permute(permute(
             i.z + vec4(0.0, i1.z, i2.z, 1.0))
           + i.y + vec4(0.0, i1.y, i2.y, 1.0))
           + i.x + vec4(0.0, i1.x, i2.x, 1.0));

    // Gradients: 7x7 points over a square, mapped onto an octahedron.
    // The ring size 17*17 = 289 is close to a multiple of 49 (49*6 = 294)
    float n_ = 0.142857142857; // 1.0/7.0
    vec3  ns = n_ * D.wyz - D.xzx;

    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);  //  mod(p,7*7)

    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);    // mod(j,N)

    vec4 x = x_ *ns.x + ns.yyyy;
    vec4 y = y_ *ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);

    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);

    vec4 s0 = floor(b0)*2.0 + 1.0;
    vec4 s1 = floor(b1)*2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));

    vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;

    vec3 p0 = vec3(a0.xy,h.x);
    vec3 p1 = vec3(a0.zw,h.y);
    vec3 p2 = vec3(a1.xy,h.z);
    vec3 p3 = vec3(a1.zw,h.w);

    // Normalise gradients
    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
    p0 *= norm.x;
    p1 *= norm.y;
    p2 *= norm.z;
    p3 *= norm.w;

    // Mix final noise value
    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}

void main() {
    vec2 values = de(texture(uPI, vS));
    float A = values.x;
    float B = values.y;

    vec4 sampledRGB = texture(uImageMapTexture, vS);
    float r = sampledRGB.r;
    float g = sampledRGB.g;
    float b = sampledRGB.b;

    // RGB to CMYK conversion
    float k_val = 1.0 - max(r, max(g, b));
    float c_val = 0.0, m_val = 0.0, y_val = 0.0;
    if (k_val < 1.0) {
        c_val = (1.0 - r - k_val) / (1.0 - k_val);
        m_val = (1.0 - g - k_val) / (1.0 - k_val);
        y_val = (1.0 - b - k_val) / (1.0 - k_val);
    }
    
    float mapValue = 0.0;
    if (uTargetChannel == 0) mapValue = c_val;
    else if (uTargetChannel == 1) mapValue = m_val;
    else if (uTargetChannel == 2) mapValue = y_val;
    else if (uTargetChannel == 3) mapValue = k_val;

    float brightness = luminance(sampledRGB.rgb);
    float edge = detectEdges(uImageMapTexture, vS, uTex);

    mapValue = mix(mapValue, 1.0, brightness * uBrightnessInfluence);
    mapValue = mix(mapValue, 1.0, edge * uEdgeInfluence);

    float aspectRatio = uResolution.x / uResolution.y;

    vec2 brushPos = uBrushPosition;
    vec2 pixelPos = vS;

    brushPos.x *= aspectRatio;
    pixelPos.x *= aspectRatio;
    float distToBrush = distance(pixelPos, brushPos) / aspectRatio;
    float brushInfluence = smoothstep(uBrushSize, uBrushSize - 0.001, distToBrush);

    A = mix(A, 1.0, brushInfluence * uBrushStrength);
    B = mix(B, 1.0, brushInfluence * uBrushStrength);

    float diffA = uDiffRates.x;
    float diffB = uDiffRates.y;
    float feedA = mix(uFeedKillRates.x, uFeedKillRates.y, mapValue);
    float killB = mix(uFeedKillRates.z, uFeedKillRates.w, mapValue);

    feedA = mix(feedA, feedA * (1.0 - brightness), uBrightnessInfluence);
    killB = mix(killB, killB * (1.0 + brightness), uBrightnessInfluence);

    feedA = mix(feedA, feedA * (1.0 - edge), uEdgeInfluence);
    killB = mix(killB, killB * (1.0 + edge), uEdgeInfluence);

    // Calculate animated 3D Simplex noise
    float noise = snoise(vec3(vS * uNoiseScale, uTime)) * uNoiseStrength;

    // Add noise to the feed rate and kill rate
    feedA = mix(feedA, feedA * (1.0 - noise), uNoiseStrength);
    killB = mix(killB, killB * (1.0 + noise), uNoiseStrength);

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
    uniform float FEED_MIN;
    uniform float FEED_MAX;
    uniform float KILL_MIN;
    uniform float KILL_MAX;
    
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
        float feedA = mix(FEED_MIN, FEED_MAX, vS.y);
        float killB = mix(KILL_MIN, KILL_MAX, vS.x);
    
        fragColor = computeNewValue(feedA, killB, uRates.x, uRates.y);
    }`,
    displaySingleChannelFrag: `#version 300 es
precision mediump float;
uniform sampler2D uChannelTexture;
in vec2 vS;
out vec4 fragColor;

${shaderUtils.enDe16}
${shaderUtils.samT}

void main() {
    float value = samT(uChannelTexture, vS);
    fragColor = vec4(vec3(value), 1.0);
}
    `,
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
                } else if (uniform.type === gl.FLOAT_VEC3) {
                    gl.uniform3fv(uniform.loc, uniform.value);
                } else if (uniform.type === gl.FLOAT_VEC4) {
                    gl.uniform4fv(uniform.loc, uniform.value);
                } else if (uniform.type === gl.BOOL || uniform.type === gl.INT) {
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
            new RenderToTextureSwapable(), // For K channel
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
        this.time = 0;  // Add this line to track time
        this.updateTextureFiltering();

    }

    updateTextureFiltering() {
        const filter = config.chunkiness > 1 ? gl.NEAREST : gl.LINEAR;
        for (const swapable of this.internalTextures) {
            for (const tex of [swapable.previousTexture, swapable.currentTexture]) {
                if (tex.texture) {
                    gl.bindTexture(gl.TEXTURE_2D, tex.texture);
                    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
                    gl.bindTexture(gl.TEXTURE_2D, null);
                }
            }
        }
    }

    initializeVAO() {
        this.vao = gl.createVertexArray();
        gl.bindVertexArray(this.vao);
        this.squareVBO = VBO.createQuad(gl, -1, -1, +1, +1);
        gl.bindVertexArray(null);
    }

    loadShaders() {
        this.asyncLoadShader("display-cmyk", shaders.disVert, shaders.displayCMYKFrag,
            (shader) => { 
                this.displayCMYKShader = shader; 
                shader.u["uPatternSharpness"].value = config.patternSharpness;
                shader.u["uPatternThreshold"].value = config.patternThreshold;
                updateShaderUniforms();
            },
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
            (shader) => { 
                this.updateImageMapShader = shader; 
                // Initialize new uniforms
                shader.u["uNoiseScale"].value = config.noiseScale;
                shader.u["uNoiseStrength"].value = config.noiseStrength;
                shader.u["uTime"].value = 0;  // Initialize time

            }
        );
        this.asyncLoadShader("reset", shaders.upVert, shaders.resFrag,
            (shader) => { this.resetShader = shader; },
            { PATTERN_SPLIT: `int(${config.patternSplit})` }
        );
        this.asyncLoadShader("display-single-channel", shaders.disVert, shaders.displaySingleChannelFrag,
            (shader) => {
                this.displaySingleChannelShader = shader;
            }
        );
    }

    restart() {
        this.needToReset = true;
        this._iteration = 0;
        this.lastIterationUpdate = performance.now() - 5000;
        this.lastUpdateTimestamp = 0;

        // Reset internal textures
        for (const texture of this.internalTextures) {
            texture.reserveSpace(this.targetWidth, this.targetHeight);
        }

        // Clear internal textures
        this.clearInternalTextures();
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
        let shader = this.displayCMYKShader;

        if (shader) {
            shader.use();

            shader.u["uC"].value = this.internalTextures[0].current;
            shader.u["uM"].value = this.internalTextures[1].current;
            shader.u["uY"].value = this.internalTextures[2].current;
            shader.u["uK"].value = this.internalTextures[3].current;

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

        this.time += config.noiseSpeed;

        if (this.updateImageMapShader) {
            this.updateImageMapShader.u["uTime"].value = this.time;
        }


        if (config.interface === "image" && ReDiff.updateImageMapShader) {
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

            this.updateImageMapShader.u["uDiffRates"].value = [config.diffA, config.diffB];
            this.updateImageMapShader.u["uFeedKillRates"].value = [config.feedAMin, config.feedAMax, config.killBMin, config.killBMax];
            

            this.updateImageMapShader.bindAttributes();

            const splitNbIterations = Math.ceil(nbIterations / 4);
            
            // Process Cyan Channel
            this.updateImageMapShader.u["uTargetChannel"].value = 0;
            this.updateImageMapShader.u["uDiffRates"].value = getChannelDiffRates('C');
            this.updateImageMapShader.u["uFeedKillRates"].value = getChannelFeedKillRates('C');
            this.updateInternal(this.updateImageMapShader, splitNbIterations, this.internalTextures[0]);
            
            // Process Magenta Channel
            this.updateImageMapShader.u["uTargetChannel"].value = 1;
            this.updateImageMapShader.u["uDiffRates"].value = getChannelDiffRates('M');
            this.updateImageMapShader.u["uFeedKillRates"].value = getChannelFeedKillRates('M');
            this.updateInternal(this.updateImageMapShader, splitNbIterations, this.internalTextures[1]);
            
            // Process Yellow Channel
            this.updateImageMapShader.u["uTargetChannel"].value = 2;
            this.updateImageMapShader.u["uDiffRates"].value = getChannelDiffRates('Y');
            this.updateImageMapShader.u["uFeedKillRates"].value = getChannelFeedKillRates('Y');
            this.updateInternal(this.updateImageMapShader, splitNbIterations, this.internalTextures[2]);

            // Process Key (Black) Channel
            this.updateImageMapShader.u["uTargetChannel"].value = 3;
            this.updateImageMapShader.u["uDiffRates"].value = getChannelDiffRates('K');
            this.updateImageMapShader.u["uFeedKillRates"].value = getChannelFeedKillRates('K');
            this.updateInternal(this.updateImageMapShader, splitNbIterations, this.internalTextures[3]);

            updateShaderUniforms();

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

        neededWidth = Math.ceil(neededWidth / config.chunkiness);
        neededHeight = Math.ceil(neededHeight / config.chunkiness);

        if (this.internalTextures[0].width !== neededWidth || this.internalTextures[0].height !== neededHeight) {
            for (const texture of this.internalTextures) {
                texture.reserveSpace(neededWidth, neededHeight);
            }
            this.updateTextureFiltering();
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


function handleKeyPress(event) {
    if (event.key.toLowerCase() === 'r') {
        if (ReDiff) {
            ReDiff.restart();
        }
    }
}

document.addEventListener('keydown', handleKeyPress);



function initControls() {
    const gui = new dat.GUI({ autoPlace: false });
    const guiContainer = document.querySelector("#gui");
    guiContainer.appendChild(gui.domElement);

    //gui.hide();

    guiContainer.style.position = 'absolute';
    guiContainer.style.top = '10px';
    guiContainer.style.right = '10px';
    guiContainer.style.zIndex = '1000';

    const presetsFolder = gui.addFolder('Presets');
    presetsFolder.add(config, 'preset', Object.keys(presets)).onChange(applyPreset);
    presetsFolder.close();

    // Add Per-Channel Algorithm Controls
    const perChannelFolder = gui.addFolder('Per-Channel Algorithms');
    perChannelFolder.add(config, 'enablePerChannelAlgorithms').name('Enable Per-Channel').onChange((value) => {
        config.enablePerChannelAlgorithms = value;
        updateShaderUniforms();
        if (ReDiff) ReDiff.restart();
    });
    perChannelFolder.add(config, 'algorithmC', Object.keys(presets)).name('Cyan Algorithm').onChange((value) => {
        config.algorithmC = value;
        updateShaderUniforms();
        if (ReDiff) ReDiff.restart();
    });
    perChannelFolder.add(config, 'algorithmM', Object.keys(presets)).name('Magenta Algorithm').onChange((value) => {
        config.algorithmM = value;
        updateShaderUniforms();
        if (ReDiff) ReDiff.restart();
    });
    perChannelFolder.add(config, 'algorithmY', Object.keys(presets)).name('Yellow Algorithm').onChange((value) => {
        config.algorithmY = value;
        updateShaderUniforms();
        if (ReDiff) ReDiff.restart();
    });
    perChannelFolder.add(config, 'algorithmK', Object.keys(presets)).name('Key (Black) Algorithm').onChange((value) => {
        config.algorithmK = value;
        updateShaderUniforms();
        if (ReDiff) ReDiff.restart();
    });
    perChannelFolder.close();

    const rdParamsFolder = gui.addFolder('Reaction-Diffusion Parameters');
    rdParamsFolder.add(config, 'diffA', 0, 0.21).step(0.00001).onChange(updateShaderUniforms).listen();
    rdParamsFolder.add(config, 'diffB', 0, 0.25).step(0.00001).onChange(updateShaderUniforms).listen();
    rdParamsFolder.add(config, 'feedAMin', 0, 0.1).step(0.00001).onChange(updateShaderUniforms).listen();
    rdParamsFolder.add(config, 'feedAMax', 0, 0.1).step(0.00001).onChange(updateShaderUniforms).listen();
    rdParamsFolder.add(config, 'killBMin', 0, 0.1).step(0.00001).onChange(updateShaderUniforms).listen();
    rdParamsFolder.add(config, 'killBMax', 0, 0.1).step(0.00001).onChange(updateShaderUniforms).listen();

    const noiseFolder = gui.addFolder('Noise');
    noiseFolder.add(config, 'noiseScale', 1, 50).step(0.1).onChange(updateShaderUniforms).listen();
    noiseFolder.add(config, 'noiseStrength', 0, 0.5).step(0.001).onChange(updateShaderUniforms).listen();
    noiseFolder.add(config, 'noiseSpeed', 0, 0.2).step(0.001).listen();
    noiseFolder.close();

    const paramsFolder = gui.addFolder('Parameters');
    paramsFolder.add(config, 'chunkiness', 1, 16, 1).name('Chunkiness').onChange(value => {
        config.chunkiness = value;
        ReDiff.updateTextureFiltering();
        ReDiff.restart();
    });
    paramsFolder.add(config, 'zoom', 0, 5).onChange(value => {
        config.zoom = value;
    });
    paramsFolder.add(config, 'speed', 1, 120).step(1).onChange(value => {
        config.speed = value;
    });
    paramsFolder.add(config, 'patternSharpness', 1, 100).step(0.1).name('Pattern Sharpness').onChange(updateShaderUniforms);
    paramsFolder.add(config, 'patternThreshold', 0, 1).step(0.01).name('Pattern Threshold').onChange(updateShaderUniforms);
    paramsFolder.add(config, 'contrast', 0, 250).step(1).onChange(value => {
        config.contrast = value;
    });
    paramsFolder.add(config, 'randomPatternScale', 1.5, 5).step(0.01).onChange(value => {
        config.randomPatternScale = value;
    });
    paramsFolder.add(config, 'edgeInfluence', -1, 1).step(0.01).onChange(value => {
        config.edgeInfluence = value;
    });
    paramsFolder.add(config, 'brightnessInfluence', -0.25, 0.25).step(0.001).onChange(value => {
        config.brightnessInfluence = value;
    });
    paramsFolder.add(config, 'invert', 0, 1).step(1).name('Invert Colors').onChange(value => {
        updateColors();
        config.invert = value ? 1 : 0;
        document.body.style.backgroundColor = config.invert === 1 ? 'white' : 'black';
    });
    paramsFolder.add(config, 'brushSize', 0.001, 0.1).onChange(value => {
        config.brushSize = value;
    });
    paramsFolder.add(config, 'brushStrength', 0, 1).onChange(value => {
        config.brushStrength = value;
    });

    paramsFolder.close();


    const colorFolder = gui.addFolder('Custom Colors');
    colorFolder.addColor(config, 'colorR').name('Red Channel Color').onChange(updateColors);
    colorFolder.addColor(config, 'colorG').name('Green Channel Color').onChange(updateColors);
    colorFolder.addColor(config, 'colorB').name('Blue Channel Color').onChange(updateColors);
    colorFolder.add(config, 'colorMix', 0, 1).step(0.01).name('Custom Color Mix').onChange(updateColors);




    const cameraFolder = gui.addFolder('Camera');
    cameraFolder.add(config, 'zoomCam', 0.5, 3).step(0.1).onChange(value => {
        config.zoomCam = value;
        if (cameraInput) {
            cameraInput.setZoom(value);
        }
    });
    
    cameraFolder.close();

    const saveFolder = gui.addFolder('Save');
    saveFolder.add({ saveImage: function() { saveCanvasAsImage(); } }, 'saveImage').name('Save Image');
    saveFolder.add({ splitAndSaveCMYK: function() { splitAndSaveCMYKChannels(); } }, 'splitAndSaveCMYK').name('Split & Save CMYK');

    const audioFolder = gui.addFolder('Audio Reactivity');
    audioFolder.add(config, 'audioReactive').name('Enable Audio Reactivity');
    audioFolder.add(config, 'audioStrengthInfluence', 0, 1).step(0.01).name('Strength Influence');
    audioFolder.add(config, 'audioSpeedInfluence', 0, 1).step(0.01).name('Speed Influence');
    audioFolder.add(config, 'audioSensitivity', 0, 2).step(0.01).name('Audio Sensitivity');
    audioFolder.add({ setupAudio: setupAudio }, 'setupAudio').name('Setup Audio');


    gui.add({ restartSimulation: function() { 
        if (ReDiff) ReDiff.restart(); 
    } }, 'restartSimulation').name('Restart')



    updateShaderUniforms();


    return gui;
}


function applyPreset(presetName) {
    const preset = presets[presetName];
    if (preset) {
        Object.assign(config, preset);
        updateShaderUniforms();
        // Update GUI controllers
        for (let i in gui.__folders) {
            const folder = gui.__folders[i];
            for (let j in folder.__controllers) {
                folder.__controllers[j].updateDisplay();
            }
        }
    }
}

function updateShaderUniforms() {
    if (ReDiff && ReDiff.updateImageMapShader) {
        ReDiff.updateImageMapShader.u["uDiffRates"].value = [config.diffA, config.diffB];
        ReDiff.updateImageMapShader.u["uFeedKillRates"].value = [config.feedAMin, config.feedAMax, config.killBMin, config.killBMax];
        ReDiff.updateImageMapShader.u["uNoiseScale"].value = config.noiseScale;
        ReDiff.updateImageMapShader.u["uNoiseStrength"].value = config.noiseStrength;
    }

    if (ReDiff && ReDiff.displayCMYKShader) {
            ReDiff.displayCMYKShader.u["uPatternSharpness"].value = config.patternSharpness;
            ReDiff.displayCMYKShader.u["uPatternThreshold"].value = config.patternThreshold;
            ReDiff.displayCMYKShader.u["uInvert"].value = config.invert;
        }

}


function updateColors() {
    updateShaderUniforms();
    // Trigger a redraw if necessary
    if (ReDiff) ReDiff.needToReset = true;
}



async function main() {
    const webglFlags = {
        alpha: false,
        antialias: false,
        depth: false,
        stencil: false,
        preserveDrawingBuffer: true,
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

    // Initialize ReDiff here
    ReDiff = new ReactionDiffusion();

    function resizeCanvas() {
        const devicePixelRatio = window.devicePixelRatio || 1;
        const displayWidth = Math.floor(window.innerWidth * devicePixelRatio);
        const displayHeight = Math.floor(window.innerHeight * devicePixelRatio);

        if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
            canvas.width = displayWidth;
            canvas.height = displayHeight;
            needToAdjustCanvasSize = true;
        }
    }

    window.addEventListener('resize', resizeCanvas);
    resizeCanvas(); // Call once to set initial size

    getTexture();

    // Now that ReDiff is initialized, we can set up the controls
    initControls();

    await setupAudio();


    function mainLoop() {
        if (needToAdjustCanvasSize) {
            resizeCanvas();
            ReDiff.resize(canvas.width, canvas.height);
            needToAdjustCanvasSize = false;
        }
    
        updateTexture();
    
        // Check if a restart is needed
        if (ReDiff.needToReset) {
            ReDiff.clearInternalTextures();
            ReDiff.needToReset = false;
        }
    
        if (ReDiff && ReDiff.displayCMYKShader) {
            ReDiff.displayCMYKShader.u["uPatternSharpness"].value = config.patternSharpness;
            ReDiff.displayCMYKShader.u["uPatternThreshold"].value = config.patternThreshold;
            ReDiff.displayCMYKShader.u["uInvert"].value = config.invert;
        }
    
        // Update audio-reactive parameters
        if (analyser && dataArray && config.audioReactive) {
            analyser.getByteFrequencyData(dataArray);
            const mappedNoiseStrength = mapNoiseStrength(dataArray) * config.audioSensitivity;
            config.noiseStrength = config.noiseStrength * (1 - config.audioStrengthInfluence) + 
                                   mappedNoiseStrength * config.audioStrengthInfluence;
            config.noiseSpeed = config.noiseSpeed * (1 - config.audioSpeedInfluence) + 
                                mapNoiseSpeed(dataArray) * config.audioSpeedInfluence;
        }
    
        if (ReDiff && ReDiff.updateImageMapShader && ReDiff.updateImageMapShader.u) {
            if (ReDiff.updateImageMapShader.u["uDiffuseScaling"]) {
                ReDiff.updateImageMapShader.u["uDiffuseScaling"].value = config.randomPatternScale;
            }
            if (ReDiff.updateImageMapShader.u["uEdgeInfluence"]) {
                ReDiff.updateImageMapShader.u["uEdgeInfluence"].value = config.edgeInfluence;
            }
            if (ReDiff.updateImageMapShader.u["uBrightnessInfluence"]) {
                ReDiff.updateImageMapShader.u["uBrightnessInfluence"].value = config.brightnessInfluence;
            }
            if (ReDiff.updateImageMapShader.u["uNoiseStrength"]) {
                ReDiff.updateImageMapShader.u["uNoiseStrength"].value = config.noiseStrength;
            }
            if (ReDiff.updateImageMapShader.u["uNoiseSpeed"]) {
                ReDiff.updateImageMapShader.u["uNoiseSpeed"].value = config.noiseSpeed;
            }
        }
    
        ReDiff.update();
        ReDiff.drawToCanvas();
    
        requestAnimationFrame(mainLoop);
    }

    mainLoop();
}

main().catch(console.error);