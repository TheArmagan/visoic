/*
{
  "CATEGORIES" : [
    "Wipe"
  ],
  "DESCRIPTION": "A hard-edged wipe transition with four selectable directions.",
  "ISFVSN" : "2",
  "INPUTS" : [
    {
      "TYPE" : "image",
      "NAME" : "startImage"
    },
    {
      "NAME" : "endImage",
      "TYPE" : "image"
    },
    {
      "MIN" : 0,
      "TYPE" : "float",
      "NAME" : "progress",
      "MAX" : 1,
      "DEFAULT" : 0
    },
    {
      "NAME" : "direction",
      "TYPE" : "long",
      "DEFAULT" : 0,
      "VALUES" : [ 0, 1, 2, 3 ],
      "LABELS" : [ "Up", "Down", "Left", "Right" ]
    }
  ],
  "CREDIT": "Nuvotion"
}
*/



vec4 getFromColor(vec2 inUV)	{
	return IMG_NORM_PIXEL(startImage, inUV);
}
vec4 getToColor(vec2 inUV)	{
	return IMG_NORM_PIXEL(endImage, inUV);
}



// Author: Jake Nelson
// License: MIT
// Adapted by: Nuvotion

vec4 transition(vec2 uv) {
  vec2 p = uv.xy;
  float m = 0.0;

  if (direction == 0) { // Up
    m = step(p.y, progress);
  } else if (direction == 1) { // Down
    m = step(1.0 - p.y, progress);
  } else if (direction == 2) { // Left
    m = step(1.0 - p.x, progress);
  } else if (direction == 3) { // Right
    m = step(p.x, progress);
  }

  return mix(getFromColor(p), getToColor(p), m);
}



void main()	{
	gl_FragColor = transition(isf_FragNormCoord.xy);
}
