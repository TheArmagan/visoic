/*{
    "DESCRIPTION": "Dual color tinting effect with adjustable blend",
    "CREDIT": "Converted to ISF",
    "ISFVSN": "2",
    "CATEGORIES": ["Color"],
    "INPUTS": [
        {
            "NAME": "inputImage",
            "TYPE": "image"
        },
        {
            "NAME": "tint",
            "TYPE": "float",
            "DEFAULT": 0.0,
            "MIN": -1.0,
            "MAX": 1.0,
            "LABEL": "Tint Balance"
        },
        {
            "NAME": "color1",
            "TYPE": "color",
            "DEFAULT": [1.0, 0.0, 0.0, 1.0],
            "LABEL": "Color 1"
        },
        {
            "NAME": "color2",
            "TYPE": "color",
            "DEFAULT": [0.0, 0.0, 1.0, 1.0],
            "LABEL": "Color 2"
        }
    ]
}*/

void main(void) {
    vec4 texel = IMG_NORM_PIXEL(inputImage, isf_FragNormCoord);
    vec4 originalColor = texel;

    // Linearly interpolate between color1 and color2 based on the tint value
    vec3 tintAdjustment = mix(color1.rgb, color2.rgb, (tint + 1.0) * 0.5);

    // Apply the tint adjustment
    vec3 color = originalColor.rgb + tintAdjustment * abs(tint);

    // Output the final color with the original alpha
    gl_FragColor = vec4(color, originalColor.a);
}