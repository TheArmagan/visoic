/*{
    "DESCRIPTION": "Frequency Modulation Effect",
    "CREDIT": "Adapted from Tomasz Sulej's FM effect",
    "CATEGORIES": [
        "Distortion"
    ],
    "INPUTS": [
        {
            "NAME": "inputImage",
            "TYPE": "image"
        },
        {
            "NAME": "frequency",
            "LABEL": "Line Frequency",
            "TYPE": "float",
            "MIN": 0.0,
            "MAX": 1.0,
            "DEFAULT": 0.405
        },
        {
            "NAME": "modulation",
            "LABEL": "Modulation Strength",
            "TYPE": "float",
            "MIN": 0.0,
            "MAX": 1.0,
            "DEFAULT": 0.04
        },
        {
            "NAME": "waveDensity",
            "LABEL": "Wave Density",
            "TYPE": "float",
            "MIN": 1.0,
            "MAX": 20.0,
            "DEFAULT": 5.0
        },
        {
            "NAME": "lineWidth",
            "LABEL": "Line Width",
            "TYPE": "float",
            "MIN": 0.01,
            "MAX": 0.5,
            "DEFAULT": 0.08
        },
        {
            "NAME": "speed",
            "LABEL": "Animation Speed",
            "TYPE": "float",
            "MIN": 0.0,
            "MAX": 10.0,
            "DEFAULT": 0.7
        },
        {
            "NAME": "distortion",
            "LABEL": "Thick Distort",
            "TYPE": "float",
            "DEFAULT": 0.0,
            "MIN": 0.0,
            "MAX": 20.0
        },
        {
            "NAME": "thickDensity",
            "LABEL": "Thick Density",
            "TYPE": "float",
            "DEFAULT": 3.0,
            "MIN": 0.1,
            "MAX": 20.0
        },
        {
            "NAME": "distortion2",
            "LABEL": "Fine Distort",
            "TYPE": "float",
            "DEFAULT": 0.0,
            "MIN": 0.0,
            "MAX": 1.0
        },
        {
            "NAME": "fineDensity",
            "LABEL": "Fine Density",
            "TYPE": "float",
            "DEFAULT": 50.0,
            "MIN": 10.0,
            "MAX": 200.0
        },
        {
            "NAME": "distortSpeed",
            "LABEL": "Distort Speed",
            "TYPE": "float",
            "DEFAULT": 0.0,
            "MIN": 0.0,
            "MAX": 3.0
        },
        {
            "NAME": "distortPhase",
            "LABEL": "Distort Phase",
            "TYPE": "float",
            "DEFAULT": 0.0,
            "MIN": 0.0,
            "MAX": 1.0
        },
        {
            "NAME": "colorMode",
            "LABEL": "Color Mode",
            "TYPE": "bool",
            "DEFAULT": true
        },
        {
            "NAME": "negate",
            "LABEL": "Invert",
            "TYPE": "bool",
            "DEFAULT": false
        }
    ]
}*/

// Simplex noise functions from Bad TV shader
vec3 mod289(vec3 x) {
  return x - floor(x * (1.0 / 289.0)) * 289.0;
}

vec2 mod289(vec2 x) {
  return x - floor(x * (1.0 / 289.0)) * 289.0;
}

vec3 permute(vec3 x) {
  return mod289(((x * 34.0) + 1.0) * x);
}

float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
  vec2 i = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);

  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;

  i = mod289(i);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));

  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m * m;
  m = m * m;

  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;

  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);

  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;

  return 130.0 * dot(m, g);
}

void main() {
    vec2 coord = gl_FragCoord.xy;
    vec2 normCoord = isf_FragNormCoord;
    vec4 color = IMG_THIS_PIXEL(inputImage);
    
    // Modulation and frequency settings
    float modVal = mix(1.0, 100.0, modulation);
    float freqVal = mix(10.0, 300.0, frequency);
    
    // Convert to grayscale for modulation input
    float gray = dot(color.rgb, vec3(0.299, 0.587, 0.114));
    
    // Calculate distortion for lines with separate speed and phase
    float distortTime = TIME * distortSpeed + distortPhase;
    float yt = normCoord.y - distortTime;
    
    // Use thickDensity parameter instead of fixed value 3.0
    float offset = snoise(vec2(yt * thickDensity, 0.0)) * 0.2;
    offset = offset * distortion * offset * distortion * offset;
    
    // Use fineDensity parameter instead of fixed value 50.0
    offset += snoise(vec2(yt * fineDensity, 0.0)) * distortion2 * 0.001;
    
    // Apply distortion to the x-coordinate only for line calculation
    float t = coord.x + offset * RENDERSIZE.x;
    float signal = gray * modVal;
    
    // Add time-based offset for animation (separate from distortion)
    float timeOffset = speed * TIME;
    float phase = 0.1 * freqVal * (t - timeOffset) * -1.0 + signal * waveDensity;
    
    // Create modulated sine wave
    float wave = sin(phase);
    
    // Create sharp lines by thresholding
    float threshold = 1.0 - lineWidth;
    float lines = step(threshold, abs(wave));
    
    vec3 result;
    
    if (colorMode) {
        // Use original colors for the lines
        if (lines > 0.5) {
            // Only lines are colored, everything else is black
            result = color.rgb * lines;
        } else {
            result = vec3(0.0);
        }
    } else {
        // Pure white lines on black background
        result = vec3(lines);
    }
    
    // Apply inversion if needed
    if (negate) {
        result = result.r > 0.5 ? vec3(0.0) : vec3(1.0);
    }
    
    gl_FragColor = vec4(result, color.a);
}