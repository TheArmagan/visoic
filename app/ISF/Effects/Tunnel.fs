/*{
	"CREDIT": "Converted to ISF",
	"DESCRIPTION": "A tunnel effect with quad mirror and optional darkening of the center.",
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
			"NAME": "rotation",
			"TYPE": "float",
			"DEFAULT": -0.25,
			"MIN": -1.0,
			"MAX": 1.0
		},
		{
			"NAME": "angle",
			"TYPE": "float",
			"DEFAULT": 0.4,
			"MIN": 0.0,
			"MAX": 2.0
		},
		{
			"NAME": "speed",
			"TYPE": "float",
			"DEFAULT": 0.1,
			"MIN": 0.0,
			"MAX": 5.0
		},
		{
			"NAME": "darkenCenter",
			"TYPE": "bool",
			"DEFAULT": true
		}
	]
}*/

#ifdef GL_ES
precision mediump float;
#endif

vec2 quadMirror(vec2 uv) {
    vec2 mirrored = mod(uv, 1.0);
    mirrored.x = mirrored.x > 0.5 ? 1.0 - mirrored.x : mirrored.x;
    mirrored.y = mirrored.y > 0.5 ? 1.0 - mirrored.y : mirrored.y;
    return mirrored * 2.0;
}

void main() {
    vec2 uv = isf_FragNormCoord;

    // Calculate aspect ratio
    float aspectRatio = RENDERSIZE.x / RENDERSIZE.y;

    // Adjust coordinates based on aspect ratio to maintain circular shape
    vec2 p = (2.0 * uv - 1.0) * vec2(aspectRatio, -1.0);

    // Rotate around the center
    float ang = rotation * 2.0 * 3.14159;
    float s = sin(ang);
    float c = cos(ang);
    p = vec2(c * p.x - s * p.y, s * p.x + c * p.y);

    // Angle of each pixel to the center of the screen
    float a = -atan(p.y, p.x);

    // Cylindrical tunnel
    float r = length(p);

    // Index texture by (animated inverse) radius and angle with distortion controlled by the angle uniform
    vec2 texUV = vec2((0.3 / r) * angle + TIME * speed, a / (3.14159 * 2.0));

    // Apply quad mirror effect
    texUV = quadMirror(texUV);

    // Fetch color with correct texture gradients, to prevent discontinuity
    vec4 textureColor = IMG_NORM_PIXEL(inputImage, texUV);

    // Darken at the center if darkenCenter is active
    vec3 col = textureColor.rgb;
    if (darkenCenter) {
        col = col * r;
    }

    // Mix the original and the displaced color
    vec4 originalColor = IMG_NORM_PIXEL(inputImage, uv);
    vec4 displacedColor = vec4(col, textureColor.a);
    gl_FragColor = vec4(displacedColor.rgb, originalColor.a);
}
