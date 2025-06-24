// Utility functions
#pragma glslify: export(de16)
float de16(vec2 v) {
    return dot(v, vec2(255.0 / 256.0, 1.0 / 256.0));
}

#pragma glslify: export(en16)
vec2 en16(float f) {
    f = 255.99 * clamp(f, 0.0, 1.0);
    return vec2(floor(f) / 255.0, fract(f));
}

#pragma glslify: export(de)
vec2 de(vec4 encoded) {
    return vec2(de16(encoded.rg), de16(encoded.ba));
}

#pragma glslify: export(en)
vec4 en(vec2 decoded) {
    return vec4(en16(decoded.x), en16(decoded.y));
}

#pragma glslify: export(samT)
float samT(sampler2D tex, vec2 position) {
    vec4 sTex = texture(tex, position);
    return de(sTex).y;
}

// Vertex Shader
#pragma glslify: export(VERTEX_SHADER)
#version 300 es
uniform vec2 s;
uniform float z;
in vec2 co;
out vec2 vS;
void main(void) {
    gl_Position = vec4(co * s * z, 0, 1);
    vS = 0.5 + 0.5 * co;
}

// Fragment Shader
#pragma glslify: export(FRAGMENT_SHADER)
#version 300 es
precision mediump float;
uniform sampler2D uR, uG, uB;
in vec2 vS;  
out vec4 fragColor;

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

// Image Map Shader
#pragma glslify: export(IMAGE_MAP_SHADER)
#version 300 es
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

// Per-channel parameters
uniform vec2 uDiffRates;        // [diffA, diffB] for current channel
uniform vec4 uFeedKillRates;    // [feedAMin, feedAMax, killBMin, killBMax] for current channel

uniform float uTimeStep;

in vec2 vS;
out vec4 fragColor;

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

    float feedA = mix(uFeedKillRates.x, uFeedKillRates.y, mapValue);
    float killB = mix(uFeedKillRates.z, uFeedKillRates.w, mapValue);
    
    feedA = mix(feedA, feedA * (1.0 - brightness), uBrightnessInfluence);
    killB = mix(killB, killB * (1.0 + brightness), uBrightnessInfluence);
    
    feedA = mix(feedA, feedA * (1.0 - edge), uEdgeInfluence);
    killB = mix(killB, killB * (1.0 + edge), uEdgeInfluence);

    vec2 laplace = kernel(values);
    float reaction = A * B * B;
    float dt = uTimeStep;
    
    A = A + dt * (uDiffRates.x * uDiffuseScaling * laplace.x - reaction + feedA * (1.0 - A));
    B = B + dt * (uDiffRates.y * uDiffuseScaling * laplace.y + reaction - (killB + feedA) * B);

    fragColor = en(vec2(A, B));
}

// Reset Shader
#pragma glslify: export(RESET_SHADER)
#version 300 es
precision mediump float;
uniform vec2 uPat;

in vec2 vS;
out vec4 fragColor;

void main() {
    float margin = 100.0;
    float width = 2160.0;
    float height = 1620.0;

    float RezX = width - (margin * 2.0);
    float RezY = height - (margin * 2.0);
    float offsetX = margin / width;
    float offsetY = margin / height;

    int numberOfDots = #INJECT(PATTERN_SPLIT);
    int uNumDots = (numberOfDots)*2;

    float aspectRatio = RezX / RezY;

    float dotRadius = 0.0075;

    const int numberOfColumns = 1;
    float columnSpacing = 1.0 / float(numberOfColumns + 1);

    float dotSpacing = (1.0 - offsetY * 2.0) / (float(uNumDots)-0.005);

    float modY = mod(vS.y * aspectRatio, dotSpacing);
    float isInsideDotVertically = step(modY, dotRadius) + step(dotSpacing - dotRadius, modY);

    float starter = 0.0;

    float adjustedY = vS.y;
    if(adjustedY + dotSpacing > 1.0) {
        adjustedY -= dotSpacing * 2.;
    }
    if(adjustedY < dotSpacing) {
        adjustedY += dotSpacing * 0.1;
    }

    for(int i = 1; i <= numberOfColumns; ++i) {
        float columnX = float(i) * columnSpacing;
        float distanceFromColumnX = abs(vS.x - columnX);
        float isInsideDotHorizontally = step(distanceFromColumnX, dotRadius);
        starter += isInsideDotVertically * isInsideDotHorizontally;
    }

    starter = step(1.0, starter);

    const float A = 1.0;
    float B = dot(uPat, vec2(starter, 0));
    vec2 values = vec2(A, B);

    fragColor = en(values);
}