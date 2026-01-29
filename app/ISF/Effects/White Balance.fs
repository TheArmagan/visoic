/*{
  "ISFVSN":"2.0",
  "LABEL":"White Balance",
  "CATEGORIES":["Color"],
  "INPUTS":[
    { "NAME":"inputImage", "TYPE":"image" },
    { "NAME":"graySample", "LABEL": "Grey", "TYPE":"color", "DEFAULT":[0.5,0.5,0.5,1.0] }
  ]
}*/

// sRGB <-> Linear helpers
vec3 toLinear(vec3 c) {
  vec3 cut = step(vec3(0.04045), c);
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), cut);
}
vec3 toSRGB(vec3 c) {
  vec3 cut = step(vec3(0.0031308), c);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, cut);
}

void main() {
  vec4 src = IMG_THIS_PIXEL(inputImage);
  vec3 lin = toLinear(src.rgb);

  vec3 pickLin = toLinear(graySample.rgb);
  float avg = (pickLin.r + pickLin.g + pickLin.b) / 3.0;
  vec3 gains = vec3(avg / max(pickLin.r, 1e-6),
                    avg / max(pickLin.g, 1e-6),
                    avg / max(pickLin.b, 1e-6));

  vec3 balanced = lin * gains;
  gl_FragColor = vec4(toSRGB(clamp(balanced, 0.0, 1.0)), src.a);
}
