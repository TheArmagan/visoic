/*{
	"CREDIT": "Converted to ISF",
	"DESCRIPTION": "Offsets RGB channels radially from a customizable center with independent horizontal and vertical displacement.",
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
			"NAME": "x",
			"TYPE": "float",
			"DEFAULT": 0.1,
			"MIN": -1.0,
			"MAX": 1.0
		},
		{
			"NAME": "y",
			"TYPE": "float",
			"DEFAULT": 0.1,
			"MIN": -1.0,
			"MAX": 1.0
		},
		{
			"NAME": "center",
			"TYPE": "point2D",
			"DEFAULT": [0.5, 0.5],
			"MIN": [0.0, 0.0],
			"MAX": [1.0, 1.0]
		}
	]
}*/

#ifdef GL_ES
precision mediump float;
#endif

void main() {
    vec2 uv = isf_FragNormCoord;
    vec2 adjustedUV = uv - vec2(0.5);
    vec2 adjustedCenter = vec2(center.x, center.y); // Use ISF's normalized center
    vec2 dir = adjustedUV - adjustedCenter;

    // Calculate direction and distance
    float d = 0.7 * length(dir);
    dir = normalize(dir);
    vec2 value = d * dir * vec2(x, y);

    // Sample the red, green, and blue channels with offsets
    vec4 c1 = IMG_NORM_PIXEL(inputImage, uv - value);
    vec4 c2 = IMG_NORM_PIXEL(inputImage, uv);
    vec4 c3 = IMG_NORM_PIXEL(inputImage, uv + value);

    // Combine the RGB channels
    gl_FragColor = vec4(c1.r, c2.g, c3.b, (c1.a + c2.a + c3.a) / 3.0);
}
