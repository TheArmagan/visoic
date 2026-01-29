/*{
    "DESCRIPTION": "Zoom blur effect with adjustable center and strength",
    "CREDIT": "Converted to ISF",
    "ISFVSN": "2",
    "CATEGORIES": ["Distortion"],
    "INPUTS": [
        {
            "NAME": "inputImage",
            "TYPE": "image"
        },
        {
            "NAME": "centerX",
            "TYPE": "float",
            "DEFAULT": 0.5,
            "MIN": 0.0,
            "MAX": 1.0,
            "LABEL": "Center X"
        },
        {
            "NAME": "centerY",
            "TYPE": "float",
            "DEFAULT": 0.5,
            "MIN": 0.0,
            "MAX": 1.0,
            "LABEL": "Center Y"
        },
        {
            "NAME": "strength",
            "TYPE": "float",
            "DEFAULT": 0.1,
            "MIN": 0.0,
            "MAX": 1.0,
            "LABEL": "Blur Strength"
        }
    ]
}*/

float random(vec3 scale, float seed) {
    return fract(sin(dot(gl_FragCoord.xyz + seed, scale)) * 43758.5453 + seed);
}

void main() {
    vec4 color = vec4(0.0);
    float total = 0.0;
    
    // Calculate direction from current pixel to center
    vec2 center = vec2(centerX, centerY);
    vec2 toCenter = center - isf_FragNormCoord;
    
    float offset = random(vec3(12.9898, 78.233, 151.7182), 0.0);
    
    const float samples = 40.0;
    
    for (float t = 0.0; t <= samples; t++) {
        float percent = (t + offset) / samples;
        float weight = 4.0 * (percent - percent * percent);
        
        // Sample along the line from current pixel towards/away from center
        vec2 samplePos = isf_FragNormCoord + toCenter * percent * strength;
        
        // Ensure we stay within texture bounds
        samplePos = clamp(samplePos, 0.0, 1.0);
        
        vec4 sampleColor = IMG_NORM_PIXEL(inputImage, samplePos);
        color += sampleColor * weight;
        total += weight;
    }
    
    vec4 originalColor = IMG_NORM_PIXEL(inputImage, isf_FragNormCoord);
    gl_FragColor = vec4((color / total).rgb, originalColor.a);
}