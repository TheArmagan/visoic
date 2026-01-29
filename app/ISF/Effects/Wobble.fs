/*{
	"CREDIT": "Converted to ISF",
	"DESCRIPTION": "A wobble distortion effect with adjustable intensity.",
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
			"NAME": "intensity",
			"TYPE": "float",
			"DEFAULT": 0.5,
			"MIN": 0.0,
			"MAX": 1.0
		}
	]
}*/

#ifdef GL_ES
precision mediump float;
#endif

void main() {
    vec2 uv = isf_FragNormCoord;

    // Apply wobble effect to UV coordinates
    uv.y -= sin(TIME + uv.y * 20.0 * cos(TIME / 100.0)) * intensity * 0.05;
    uv.x += cos(TIME + uv.x * -20.0 * sin(TIME / 100.0)) * intensity * 0.05;

    // Fetch the modified and original colors
    vec4 tex = IMG_NORM_PIXEL(inputImage, uv);
    vec4 originalTex = IMG_NORM_PIXEL(inputImage, isf_FragNormCoord);

    // Output the final color
    gl_FragColor = vec4(tex.rgb, originalTex.a);
}
