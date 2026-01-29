/*{
	"CREDIT": "Converted to ISF",
	"DESCRIPTION": "Distorts pixel positions using polar coordinates and sinusoidal distortion on radial distance.",
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
			"NAME": "distortion",
			"TYPE": "float",
			"DEFAULT": 0.5,
			"MIN": -1.0,
			"MAX": 1.0
		}
	]
}*/

#ifdef GL_ES
precision mediump float;
#endif

#define PI 3.1415926535897932384626433832795

void main() {
    vec2 uv = isf_FragNormCoord - vec2(0.5);

    // Calculate polar coordinates
    float uva = atan(uv.x, uv.y);
    float uvd = sqrt(dot(uv, uv));
    
    // Apply distortion
    float k = sin(distortion);
    uvd = uvd * (1.0 + k * uvd * uvd);

    // Compute the distorted coordinates
    vec2 distortedUV = vec2(0.5) + vec2(sin(uva), cos(uva)) * uvd;

    // Fetch the distorted color
    vec4 distortedColor = IMG_NORM_PIXEL(inputImage, distortedUV);
    
    // Output the final color
    gl_FragColor = distortedColor;
}
