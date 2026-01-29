/*{
	"DESCRIPTION": "Edge Detection Transition Effect",
	"CREDIT": "Woohyun Kim",
	"CATEGORIES": ["Dissolve"],
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
			"NAME": "edge_thickness",
			"TYPE": "float",
			"DEFAULT": 0.001,
			"MIN": 0.0001,
			"MAX": 0.01
		},
		{
			"NAME": "edge_brightness",
			"TYPE": "float",
			"DEFAULT": 8.0,
			"MIN": 0.0,
			"MAX": 20.0
		}
	]
}*/

// Author: Woohyun Kim
// License: MIT
// Converted to ISF format

vec4 detectEdgeColor(vec3[9] c) {
  /* adjacent texel array for texel c[4]
    036
    147
    258
  */
  vec3 dx = 2.0 * abs(c[7]-c[1]) + abs(c[2] - c[6]) + abs(c[8] - c[0]);
  vec3 dy = 2.0 * abs(c[3]-c[5]) + abs(c[6] - c[8]) + abs(c[0] - c[2]);
  float delta = length(0.25 * (dx + dy) * 0.5);
  return vec4(clamp(edge_brightness * delta, 0.0, 1.0) * c[4], 1.0);
}

vec4 getFromEdgeColor(vec2 uv) {
  vec3 c[9];
  for (int i=0; i < 3; ++i) {
    for (int j=0; j < 3; ++j) {
      vec4 color = IMG_NORM_PIXEL(startImage, uv + edge_thickness * vec2(i-1,j-1));
      c[3*i + j] = color.rgb;
    }
  }
  return detectEdgeColor(c);
}

vec4 getToEdgeColor(vec2 uv) {
  vec3 c[9];
  for (int i=0; i < 3; ++i) {
    for (int j=0; j < 3; ++j) {
      vec4 color = IMG_NORM_PIXEL(endImage, uv + edge_thickness * vec2(i-1,j-1));
      c[3*i + j] = color.rgb;
    }
  }
  return detectEdgeColor(c);
}

void main() {
  vec2 uv = gl_FragCoord.xy / RENDERSIZE.xy;
  
  vec4 start = mix(IMG_NORM_PIXEL(startImage, uv), getFromEdgeColor(uv), clamp(2.0 * progress, 0.0, 1.0));
  vec4 end = mix(getToEdgeColor(uv), IMG_NORM_PIXEL(endImage, uv), clamp(2.0 * (progress - 0.5), 0.0, 1.0));
  
  gl_FragColor = mix(
    start,
    end,
    progress
  );
}