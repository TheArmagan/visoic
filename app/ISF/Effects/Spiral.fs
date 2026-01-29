/*{
    "DESCRIPTION": "Spiral warping effect",
    "CREDIT": "Converted to ISF",
    "ISFVSN": "2",
    "CATEGORIES": ["Distortion"],
    "INPUTS": [
        {
            "NAME": "inputImage",
            "TYPE": "image"
        },
        {
            "NAME": "frequency",
            "TYPE": "float",
            "DEFAULT": 1.0,
            "MIN": 0.0,
            "MAX": 10.0
        },
        {
            "NAME": "spirals",
            "TYPE": "float",
            "DEFAULT": 1.0,
            "MIN": 0.1,
            "MAX": 10.0
        },
        {
            "NAME": "mode",
            "TYPE": "long",
            "VALUES": [
                0,
                1,
                2
            ],
            "LABELS": [
                "Full Spiral",
                "Horizontal Only",
                "Vertical Only"
            ],
            "DEFAULT": 0
        }
    ]
}*/

const float two_pi = 6.28318530718;
const float inner_radius = 0.1;
const float outer_radius = 0.5;

vec2 wrap(vec2 pos, float r1, float r2, vec2 originalUv) {
    float aspectRatio = RENDERSIZE.x/RENDERSIZE.y;
    float theta = pos.x * two_pi * frequency + TIME;
    float r = pos.y * (r2 - r1) + r1;
    
    float correctedX = 0.5 + r * cos(theta) / aspectRatio;
    
    if(mode == 0)
        return vec2(correctedX, 0.5 + r * sin(theta));
    else if(mode == 1)
        return vec2(correctedX, originalUv.y);
    else if(mode == 2)
        return vec2(originalUv.x, 0.5 + r * sin(theta));
    else 
        return vec2(correctedX, 0.5 + r * sin(theta));
}

vec2 unwrap(vec2 pos, float factor) {
    float aspectRatio = RENDERSIZE.x/RENDERSIZE.y;
    vec2 centred = pos - vec2(0.5, 0.5);
    centred.x *= aspectRatio;
    float theta = atan(centred.y, centred.x);
    float phi = theta / two_pi;
    float r2 = dot(centred, centred);
    float logr = 0.5 * log(r2) * frequency * spirals;
    float y = logr - phi;
    return vec2(phi, y - floor(y));   
}

void main() {
    vec2 originalUv = isf_FragNormCoord;
    vec2 spiralledUv = wrap(unwrap(originalUv, frequency), inner_radius, outer_radius, originalUv);
    vec4 color = IMG_NORM_PIXEL(inputImage, spiralledUv);
    vec4 originalColor = IMG_NORM_PIXEL(inputImage, originalUv);

    gl_FragColor = vec4(color.rgb, originalColor.a);
}