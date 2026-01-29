/*{
	"DESCRIPTION": "Rolls Transition Effect",
	"CREDIT": "Mark Craig (mrmcsoftware on github and youtube)",
	"CATEGORIES": ["Wipe"],
	"INPUTS": [
		{
			"NAME": "startImage",
			"TYPE": "image"
		},
		{
			"NAME": "endImage",
			"TYPE": "image"
		},
		{
			"NAME": "progress",
			"TYPE": "float",
			"DEFAULT": 0.0,
			"MIN": 0.0,
			"MAX": 1.0
		},
		{
			"NAME": "type",
			"TYPE": "long",
			"VALUES": [0, 1, 2, 3],
			"LABELS": ["Top-Left", "Top-Right", "Bottom-Left", "Bottom-Right"],
			"DEFAULT": 0
		},
		{
			"NAME": "RotDown",
			"TYPE": "bool",
			"DEFAULT": false
		}
	]
}*/

// Author: Mark Craig
// mrmcsoftware on github and youtube (http://www.youtube.com/MrMcSoftware)
// License: MIT
// Rolls Transition by Mark Craig (Copyright © 2022)
// Converted to ISF format

#define M_PI 3.14159265358979323846

void main() {
	vec2 uv = isf_FragNormCoord;
	float ratio = RENDERSIZE.x / RENDERSIZE.y;
	
	float theta, c1, s1;
	vec2 iResolution = vec2(ratio, 1.0);
	vec2 uvi;
	
	// I used if/else instead of switch in case it's an old GPU
	if (type == 0) { theta = (RotDown ? M_PI : -M_PI) / 2.0 * progress; uvi.x = 1.0 - uv.x; uvi.y = uv.y; }
	else if (type == 1) { theta = (RotDown ? M_PI : -M_PI) / 2.0 * progress; uvi = uv; }
	else if (type == 2) { theta = (RotDown ? -M_PI : M_PI) / 2.0 * progress; uvi.x = uv.x; uvi.y = 1.0 - uv.y; }
	else if (type == 3) { theta = (RotDown ? -M_PI : M_PI) / 2.0 * progress; uvi = 1.0 - uv; }
	
	c1 = cos(theta); 
	s1 = sin(theta);
	
	vec2 uv2;
	uv2.x = (uvi.x * iResolution.x * c1 - uvi.y * iResolution.y * s1);
	uv2.y = (uvi.x * iResolution.x * s1 + uvi.y * iResolution.y * c1);
	
	if ((uv2.x >= 0.0) && (uv2.x <= iResolution.x) && (uv2.y >= 0.0) && (uv2.y <= iResolution.y)) {
		uv2 /= iResolution;
		if (type == 0) { uv2.x = 1.0 - uv2.x; }
		else if (type == 2) { uv2.y = 1.0 - uv2.y; }
		else if (type == 3) { uv2 = 1.0 - uv2; }
		gl_FragColor = IMG_NORM_PIXEL(startImage, uv2);
	} else {
		gl_FragColor = IMG_NORM_PIXEL(endImage, uv);
	}
}