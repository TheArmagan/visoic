/*{
	"DESCRIPTION": "Cannabis Curve Transition Effect",
	"CREDIT": "@Flexi23, inspired by http://www.wolframalpha.com/input/?i=cannabis+curve",
	"CATEGORIES": ["Pattern"],
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
		}
	]
}*/

// Author: @Flexi23
// License: MIT
// inspired by http://www.wolframalpha.com/input/?i=cannabis+curve
// Converted to ISF format

void main() {
  vec2 uv = isf_FragNormCoord;
  
  if(progress == 0.0){
    gl_FragColor = IMG_NORM_PIXEL(startImage, uv);
    return;
  }
  
  vec2 leaf_uv = (uv - vec2(0.5))/10./pow(progress,3.5);
  leaf_uv.y += 0.35;
  float r = 0.18;
  float o = atan(leaf_uv.y, leaf_uv.x);
  
  float leafPattern = 1. - length(leaf_uv) + r * (1.+sin(o)) * (1.+0.9 * cos(8.*o)) * (1.+0.1*cos(24.*o)) * (0.9+0.05*cos(200.*o));
  float mask = 1. - step(leafPattern, 1.);
  
  gl_FragColor = mix(IMG_NORM_PIXEL(startImage, uv), IMG_NORM_PIXEL(endImage, uv), mask);
}