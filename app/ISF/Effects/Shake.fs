/*{
    "CATEGORIES": [
        "Distortion", "Animated"
    ],
    "DESCRIPTION": "Introduces random oscillating shifts in position with variable amplitude and frequency.",
    "CREDIT": "by VIDVOX",
    "INPUTS": [
        {
            "NAME": "inputImage",
            "TYPE": "image"
        },
        {
            "DEFAULT": 0,
            "MAX": 2,
            "MIN": 0,
            "NAME": "amplitude",
            "TYPE": "float"
        },
        {
            "DEFAULT": 1,
            "MAX": 10,
            "MIN": 0,
            "NAME": "frequency",
            "TYPE": "float"
        }
    ],
    "ISFVSN": "2"
}
*/


const float pi = 3.14159265359;


float rand(vec2 co) {
	return fract(sin(dot(co.xy, vec2(12.9898,78.233))) * 43758.5453);
}

void main(void) {
	float offset = 0.1 * amplitude;
	vec2 uv = gl_FragCoord.xy / RENDERSIZE.xy;
	float rotation = frequency * 2.0 * pi * rand(vec2(amplitude, TIME));
	float yOffset = offset * sin(TIME * 1.0 * cos(TIME * frequency) + rotation) * rand(vec2(amplitude, TIME));
	float xOffset = offset * cos(TIME * 1.0 * cos(TIME * frequency) + rotation) * rand(vec2(1.0-amplitude, TIME));;
	
	float zoom = 1.0 + offset;

	uv = (uv - 0.5) / zoom + 0.5;

	uv.y += yOffset;
	uv.x += xOffset;

	gl_FragColor = IMG_NORM_PIXEL(inputImage, uv);
}