/*{
    "CATEGORIES": [
        "Color", "Static"
    ],
    "DESCRIPTION": "Vignette with adjustable intensity, edge softness, center mix, and invert option.",
    "CREDIT": "by v002, mod by GPT-4",
    "INPUTS": [
        {
            "NAME": "inputImage",
            "TYPE": "image"
        },
        {
            "DEFAULT": 0.5,
            "MAX": 1,
            "MIN": 0,
            "NAME": "vignette",
            "TYPE": "float",
            "LABEL": "Amount"
        },
        {
            "DEFAULT": 0,
            "MAX": 1,
            "MIN": 0,
            "NAME": "vignetteEdge",
            "TYPE": "float",
            "LABEL": "Edge"
        },
        {
            "DEFAULT": 0,
            "MAX": 1,
            "MIN": 0,
            "NAME": "vignetteMix",
            "TYPE": "float",
            "LABEL": "Mix"
        },
        {
            "NAME": "invertVignette",
            "TYPE": "bool",
            "DEFAULT": false,
            "LABEL": "Invert"
        }
    ],
    "ISFVSN": "2"
}
*/

// create a black and white oval about the center of our image for our vignette
vec4 vignetteFucntion(vec2 normalizedTexcoord, float vignetteedge, float vignetteMix, bool invert)
{
    normalizedTexcoord = 2.0 * normalizedTexcoord - 1.0; // - 1.0 to 1.0
    float r = length(normalizedTexcoord);
    vec4 vignette = vec4(smoothstep(0.0, 1.0, pow(clamp(r - vignetteMix, 0.0, 1.0), 1.0 + vignetteedge * 10.0)));
    if (invert) {
        return vignette; // center dark, edges light
    } else {
        return clamp(1.0 - vignette, 0.0, 1.0); // center light, edges dark
    }
}

void main (void) 
{ 		
    vec2 normcoord = vec2(isf_FragNormCoord[0],isf_FragNormCoord[1]);

    // make a vignette around our borders.
    vec4 vignetteResult = vignetteFucntion(normcoord, vignetteEdge, vignetteMix, invertVignette);

    // sharpen via unsharp mask (subtract image from blured image)
    vec4 input0 = IMG_THIS_PIXEL(inputImage);

    gl_FragColor = mix(input0, vignetteResult * input0, vignette);		
} 