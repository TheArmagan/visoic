/*{
	"CREDIT": "Converted to ISF",
	"DESCRIPTION": "A thresholding effect with noise and multi-step thresholds for grayscale values.",
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
			"NAME": "thresholdWhite",
			"TYPE": "float",
			"DEFAULT": 0.8,
			"MIN": 0.0,
			"MAX": 1.0
		},
		{
			"NAME": "thresholdGray",
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

// Multi-step threshold function
float threshold(float color) {
    if (color > thresholdWhite) {
        return 1.0;
    } else if (color > thresholdGray) {
        return 0.5;
    } else {
        return 0.0;
    }
}

void main() {
    vec2 uv = isf_FragNormCoord;

    // Fetch the image color
    vec4 imgColor = IMG_NORM_PIXEL(inputImage, uv);

    // Convert to grayscale
    float grayscale = dot(imgColor.rgb, vec3(0.299, 0.587, 0.114));

    // Apply noise
    float noise = rand(uv) / 9.0 * noiseMultiplier;

    // Apply threshold
    float thresholded = threshold(grayscale + noise);

    // Calculate the final color by blending original and thresholded color
    vec4 finalColor = vec4(vec3(thresholded), imgColor.a);

    // Output color
    gl_FragColor = finalColor;
}
