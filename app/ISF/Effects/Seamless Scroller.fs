/*{
    "DESCRIPTION": "Seamless rolling scroller with independent horizontal and vertical controls. Quad-mirroring is used only to make the edges seamless, and the image is zoomed to preserve scale. Now zoomed in by 2x. Direction and rate controls for X and Y. Y is offset by 0.5.",
    "CREDIT": "Harmony",
    "ISFVSN": "2",
    "CATEGORIES": ["Reflection", "Animated"],
    "INPUTS": [
        {
            "NAME": "inputImage",
            "TYPE": "image",
            "LABEL": "Input Image"
        },
        {
            "NAME": "directionX",
            "TYPE": "float",
            "DEFAULT": 0.35,
            "MIN": -1.0,
            "MAX": 1.0,
            "LABEL": "Direction X"
        },
        {
            "NAME": "directionY",
            "TYPE": "float",
            "DEFAULT": 0.2,
            "MIN": -1.0,
            "MAX": 1.0,
            "LABEL": "Direction Y"
        },
        {
            "NAME": "rateX",
            "TYPE": "float",
            "DEFAULT": 0.2,
            "MIN": 0.0,
            "MAX": 2.0,
            "LABEL": "Rate X"
        },
        {
            "NAME": "rateY",
            "TYPE": "float",
            "DEFAULT": 0.2,
            "MIN": 0.0,
            "MAX": 2.0,
            "LABEL": "Rate Y"
        }
    ]
}*/

// Quad-mirror and scale by 2, so all scrolling is seamless at the edges
vec2 quadMirror(vec2 uv) {
    uv = uv * 2.0;
    uv = abs(fract(uv) - 0.5) * 2.0;
    return uv;
}

void main() {
    // Normalized coordinates
    vec2 uv = isf_FragNormCoord;

    // --- ZOOM IN THE WHOLE EFFECT BY 2X (centered) ---
    uv = (uv - 0.5) * 0.5 + 0.5;

    // --- OFFSET Y BY 0.5 ---
    uv.y += 0.25;

    // Scroll the coordinates with direction and rate
    uv.x = fract(uv.x + directionX * rateX * TIME);
    uv.y = fract(uv.y + directionY * rateY * TIME);

    // Zoom in by 2x to compensate for quad-mirroring
    uv = uv * 0.5;

    // Then, apply quad-mirroring to make the edges seamless
    uv = quadMirror(uv);

    // Sample the image
    vec4 color = IMG_NORM_PIXEL(inputImage, uv);

    gl_FragColor = color;
}