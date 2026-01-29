/*{
	"CREDIT": "Converted to ISF",
	"DESCRIPTION": "Slices with adjustable rotation, intensity, and dynamic phase shifts.",
	"ISFVSN": "2",
	"CATEGORIES": [
		"Distortion", "Animated"
	],
	"INPUTS": [
		{
			"NAME": "inputImage",
			"TYPE": "image"
		},
		{
			"NAME": "slices",
			"TYPE": "float",
			"DEFAULT": 10.0,
			"MIN": 1.0,
			"MAX": 100.0
		},
		{
			"NAME": "intensity",
			"TYPE": "float",
			"DEFAULT": 0.1,
			"MIN": 0.0,
			"MAX": 1.0
		},
		{
			"NAME": "angle",
			"TYPE": "float",
			"DEFAULT": 0.0,
			"MIN": -360.0,
			"MAX": 360.0
		}
	]
}*/

#ifdef GL_ES
precision mediump float;
#endif

#define PI 3.1415926535897932384626433832795

void main() {
    vec2 uv = isf_FragNormCoord;

    // Compute slice increment
    float sliceIncrement = 1.0 / slices;

    // Rotate UV coordinates
    float radAngle = angle * PI / 180.0; // Convert angle to radians
    vec2 rotatedPixel = vec2(
        uv.x * cos(radAngle) - uv.y * sin(radAngle),
        uv.x * sin(radAngle) + uv.y * cos(radAngle)
    );

    // Calculate slice offset
    float offset = floor(rotatedPixel.y / sliceIncrement) * sliceIncrement;

    // Add slicing distortion
    float phase = mod(TIME, 2.0 * PI); // Use ISF's built-in TIME variable
    uv.x += sin((offset + phase) * 4.0) * intensity;

    // Fetch distorted and original colors
    vec4 tex = IMG_NORM_PIXEL(inputImage, uv);
    vec4 originalTex = IMG_NORM_PIXEL(inputImage, isf_FragNormCoord);

    // Combine the results
    vec4 fragColor = vec4(tex.rgb, originalTex.a);

    // Output the final color
    gl_FragColor = fragColor;
}
