/*{
	"CREDIT": "Converted to ISF",
	"DESCRIPTION": "A thresholding effect applied separately to red, green, and blue channels, with noise control.",
	"ISFVSN": "2",
	"CATEGORIES": [
		"Color", "Static"
	],
	"INPUTS": [
		{
			"NAME": "inputImage",
			"TYPE": "image"
		},
		{
			"NAME": "thresholdRed",
			"TYPE": "float",
			"DEFAULT": 0.5,
			"MIN": 0.0,
			"MAX": 1.0
		},
		{
			"NAME": "thresholdGreen",
			"TYPE": "float",
			"DEFAULT": 0.5,
			"MIN": 0.0,
			"MAX": 1.0
		},
		{
			"NAME": "thresholdBlue",
			"TYPE": "float",
			"DEFAULT": 0.5,
			"MIN": 0.0,
			"MAX": 1.0
		},
		{
			"NAME": "noiseMultiplier",
			"TYPE": "float",
			"DEFAULT": 0.1,
			"MIN": 0.0,
			"MAX": 1.0
		}
	]
}*/

#ifdef GL_ES
precision mediump float;
#endif

// Function to generate random noise
float rand(vec2 uv) {
    return fract(sin(dot(uv.xy, vec2(12.9898, 78.233))) * 43758.5453);
}

// Multi-step threshold function for individual channels
vec3 colorThreshold(vec3 color) {
    vec3 result;
    result.r = color.r > thresholdRed ? 1.0 : 0.0;
    result.g = color.g > thresholdGreen ? 1.0 : 0.0;
    result.b = color.b > thresholdBlue ? 1.0 : 0.0;
    return result;
}

void main() {
    vec2 uv = isf_FragNormCoord;

    // Fetch the input image color
    vec4 imgColor = IMG_NORM_PIXEL(inputImage, uv);

    // Apply noise
    vec3 noise = rand(uv) / 9.0 * noiseMultiplier * vec3(1.0, 1.0, 1.0);

    // Apply threshold to each channel separately
    vec3 thresholded = colorThreshold(imgColor.rgb + noise);

    // Calculate the final color
    vec4 finalColor = vec4(thresholded, imgColor.a);

    // Output color
    gl_FragColor = finalColor;
}
