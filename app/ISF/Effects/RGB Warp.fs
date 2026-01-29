/*{
	"CREDIT": "Converted to ISF",
	"DESCRIPTION": "Distorts RGB channels with per-channel noise-based offsets for a dynamic warp effect.",
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
			"NAME": "strength",
			"TYPE": "float",
			"DEFAULT": 0.5,
			"MIN": 0.0,
			"MAX": 1.0
		},
		{
			"NAME": "shift",
			"TYPE": "float",
			"DEFAULT": 0.02,
			"MIN": 0.0,
			"MAX": 0.1
		}
	]
}*/

#ifdef GL_ES
precision mediump float;
#endif

vec2 random2(vec2 st) {
    st = vec2(dot(st, vec2(127.1, 311.7)), dot(st, vec2(269.5, 183.3)));
    return -1.0 + 2.0 * fract(sin(st) * 43758.5453123);
}

float noise(vec2 st) {
    vec2 i = floor(st);
    vec2 f = fract(st);

    vec2 u = f * f * (3.0 - 2.0 * f);

    return mix(
        mix(dot(random2(i + vec2(0.0, 0.0)), f - vec2(0.0, 0.0)),
            dot(random2(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0)), u.x),
        mix(dot(random2(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0)),
            dot(random2(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0)), u.x),
        u.y
    );
}

void main() {
    vec2 uv = isf_FragNormCoord;
    float t = 0.2 * TIME; // Use ISF's built-in TIME variable
    float colorOffsetR = shift;
    float colorOffsetG = 2.0 * shift;
    float colorOffsetB = 3.0 * shift;
    float amp = strength * clamp(1.0 - length(uv - vec2(0.5, 0.5)), 0.0, 1.0);

    // Compute UV shifts for RGB channels
    vec2 uvR = uv + amp * vec2(noise(uv + vec2(colorOffsetR + t, 0.0)), noise(312.0 + uv + vec2(colorOffsetR + t, 0.0)));
    vec2 uvG = uv + amp * vec2(noise(uv + vec2(colorOffsetG + t, 0.0)), noise(312.0 + uv + vec2(colorOffsetG + t, 0.0)));
    vec2 uvB = uv + amp * vec2(noise(uv + vec2(colorOffsetB + t, 0.0)), noise(312.0 + uv + vec2(colorOffsetB + t, 0.0)));

    // Fetch RGB values with offsets
    vec4 colorR = IMG_NORM_PIXEL(inputImage, uvR);
    vec4 colorG = IMG_NORM_PIXEL(inputImage, uvG);
    vec4 colorB = IMG_NORM_PIXEL(inputImage, uvB);

    // Combine RGB channels and maintain alpha
    vec4 originalColor = IMG_NORM_PIXEL(inputImage, uv);
    vec4 color = vec4(colorR.r, colorG.g, colorB.b, originalColor.a);

    // Output the final color
    gl_FragColor = color;
}
