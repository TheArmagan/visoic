/*{
    "CATEGORIES": [],
    "DESCRIPTION": "Instant switch from start to end at the halfway point of progress.",
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
            "NAME": "progress",
            "TYPE": "float",
            "DEFAULT": 0.0,
            "MIN": 0.0,
            "MAX": 1.0
        }
    ]
}*/

void main() {
    vec2 uv = isf_FragNormCoord.xy;

    // Get the color from both images
    vec4 colorA = IMG_NORM_PIXEL(startImage, uv);
    vec4 colorB = IMG_NORM_PIXEL(endImage, uv);

    // Cut transition happens when progress >= 0.5
    vec4 outputColor = (progress < 0.5) ? colorA : colorB;

    // Output the final color
    gl_FragColor = outputColor;
}
