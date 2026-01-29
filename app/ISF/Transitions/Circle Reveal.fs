/*{
    "CATEGORIES": [
        "Wipe"
    ],
    "CREDIT": "Automatically converted from https://www.github.com/gl-transitions/gl-transitions/tree/master/CircleCrop.glsl",
    "DESCRIPTION": "Circular crop transition revealing background image.",
    "INPUTS": [
        {
            "NAME": "startImage",
            "TYPE": "image"
        },
        {
            "NAME": "endImage",
            "TYPE": "image"
        },
        {
            "DEFAULT": 0,
            "MAX": 1,
            "MIN": 0,
            "NAME": "progress",
            "TYPE": "float"
        },
        {
            "DEFAULT": 0.001,
            "MAX": 0.1,
            "MIN": 0,
            "NAME": "edgeFade",
            "TYPE": "float",
            "LABEL": "Edge Fade"
        }
    ],
    "ISFVSN": "2"
}
*/

vec4 getFromColor(vec2 inUV) {
    return IMG_NORM_PIXEL(startImage, inUV);
}
vec4 getToColor(vec2 inUV) {
    return IMG_NORM_PIXEL(endImage, inUV);
}

float ratio = RENDERSIZE.x/RENDERSIZE.y;
vec2 ratio2 = vec2(1.0, 1.0 / ratio);

const float CIRCLE_SCALE = 0.7;

vec4 transition(vec2 p) {
    float dist = length((vec2(p) - 0.5) * ratio2);
    float r = CIRCLE_SCALE * (1.0 - progress);
    float mask = edgeFade > 0.0 ? 
        smoothstep(r, r - edgeFade, dist) : 
        step(dist, r);
    
    return mix(
        getToColor(p),
        getFromColor(p),
        mask
    );
}

void main() {
    gl_FragColor = transition(isf_FragNormCoord.xy);
}