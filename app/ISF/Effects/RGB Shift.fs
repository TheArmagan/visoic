/*{
	"CREDIT": "Converted to ISF",
	"DESCRIPTION": "Separates RGB channels based on a directional offset determined by amount and angle.",
	"ISFVSN": "2",
	"CATEGORIES": [
		"Distortion", "Static"
	],
	"INPUTS": [
		{
			"NAME": "inputImage",
			"TYPE": "image"
		},
		{
			"NAME": "amount",
			"TYPE": "float",
			"DEFAULT": 0.01,
			"MIN": 0.0,
			"MAX": 0.1
		},
		{
			"NAME": "angle",
			"TYPE": "float",
			"DEFAULT": 0.0,
			"MIN": -6.28319,
			"MAX": 6.28319
		}
	]
}*/

#ifdef GL_ES
precision mediump float;
#endif

void main() {
    vec2 uv = isf_FragNormCoord;

    // Compute the offset based on amount and angle
    vec2 offset = amount * vec2(cos(angle), sin(angle));

    // Sample the red, green, and blue channels with offsets
    vec4 cr = IMG_NORM_PIXEL(inputImage, uv + offset); // Red channel
    vec4 cga = IMG_NORM_PIXEL(inputImage, uv);        // Green channel
    vec4 cb = IMG_NORM_PIXEL(inputImage, uv - offset); // Blue channel

    // Combine the shifted RGB channels
    gl_FragColor = vec4(cr.r, cga.g, cb.b, cga.a);
}
