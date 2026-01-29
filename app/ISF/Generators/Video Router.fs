/*{
  "CATEGORIES": [
    "Basic",
    "Efficient",
    "Commercial"
  ],
  "ISFVSN": "2",
  "INPUTS": [
    {
      "NAME": "source",
      "TYPE": "image",
      "LABEL": "Source"
    },
    {
      "NAME": "scaleMode",
      "TYPE": "long",
      "DEFAULT": 0,
      "VALUES": [0, 1, 2],
      "LABELS": ["Fill", "Fit", "Stretch"],
      "LABEL": "Scale Mode"
    },
    {
      "NAME": "useAlphaMask",
      "TYPE": "bool",
      "DEFAULT": true,
      "LABEL": "Transparent Borders"
    }
  ],
  "CREDIT": "Nuvotion"
}*/

void main() {
  vec2 uv = isf_FragNormCoord;
  vec2 texSize = vec2(textureSize(source, 0));
  vec2 renderSize = RENDERSIZE;

  float texAspect = texSize.x / texSize.y;
  float renderAspect = renderSize.x / renderSize.y;

  // Compute scale factors correctly
  vec2 scaleFit = vec2(max(renderAspect / texAspect, 1.0), max(texAspect / renderAspect, 1.0));
  vec2 scaleFill = vec2(min(renderAspect / texAspect, 1.0), min(texAspect / renderAspect, 1.0));

  // Masks for selecting mode
  float isFill = step(0.5, 1.0 - abs(scaleMode - 0.0));  // 1 if scaleMode == 0 (Fill)
  float isFit = step(0.5, 1.0 - abs(scaleMode - 1.0));   // 1 if scaleMode == 1 (Fit)
  float isStretch = step(0.5, 1.0 - abs(scaleMode - 2.0)); // 1 if scaleMode == 2 (Stretch)

  // Compute final scale based on selected mode
  vec2 scale = mix(vec2(1.0), scaleFit, isFit);
  scale = mix(scale, scaleFill, isFill);
  scale = mix(scale, vec2(1.0), isStretch);  // Stretch overrides all scaling

  // Apply scale and center coordinates
  vec2 centeredCoord = (uv - 0.5) * scale + 0.5;

  // Sample the source texture
  vec4 color = IMG_NORM_PIXEL(source, centeredCoord);

  // Make the areas outside the texture transparent in Fit mode (if useAlphaMask is enabled)
  float inBounds = step(0.0, centeredCoord.x) * step(centeredCoord.x, 1.0) * 
                   step(0.0, centeredCoord.y) * step(centeredCoord.y, 1.0);
  
  float alphaMask = mix(1.0, inBounds, float(useAlphaMask)); // Only applies if useAlphaMask == true

  // Blend with transparency only when in Fit mode and if alpha mask is enabled
  gl_FragColor = vec4(color.rgb, color.a * mix(1.0, alphaMask, isFit));
}
