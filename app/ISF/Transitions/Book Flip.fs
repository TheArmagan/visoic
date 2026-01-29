/*{
	"DESCRIPTION": "Skew Transition Effect",
	"CREDIT": "hong",
	"CATEGORIES": ["Retro", "Wipe"],
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

// Author: hong
// License: MIT
// Converted to ISF format

vec2 skewRight(vec2 p) {
  float skewX = (p.x - progress)/(0.5 - progress) * 0.5;
  float skewY = (p.y - 0.5)/(0.5 + progress * (p.x - 0.5) / 0.5)* 0.5 + 0.5;
  return vec2(skewX, skewY);
}

vec2 skewLeft(vec2 p) {
  float skewX = (p.x - 0.5)/(progress - 0.5) * 0.5 + 0.5;
  float skewY = (p.y - 0.5) / (0.5 + (1.0 - progress) * (0.5 - p.x) / 0.5) * 0.5 + 0.5;
  return vec2(skewX, skewY);
}

vec4 addShade() {
  float shadeVal = max(0.7, abs(progress - 0.5) * 2.0);
  return vec4(vec3(shadeVal), 1.0);
}

void main() {
  vec2 p = isf_FragNormCoord;
  float pr = step(1.0 - progress, p.x);
  
  if (p.x < 0.5) {
    gl_FragColor = mix(IMG_NORM_PIXEL(startImage, p), 
                      IMG_NORM_PIXEL(endImage, skewLeft(p)) * addShade(), 
                      pr);
  } else {
    gl_FragColor = mix(IMG_NORM_PIXEL(startImage, skewRight(p)) * addShade(), 
                      IMG_NORM_PIXEL(endImage, p),
                      pr);
  }
}