/*{
  "DESCRIPTION": "Frame delay feedback effect using circular buffer system",
  "CATEGORIES": ["Feedback"],
  "CREDIT": "Harmony",
  "ISFVSN": "2.0",
  "INPUTS": [
    {
      "NAME": "inputImage",
      "TYPE": "image"
    },
    {
      "NAME": "delay",
      "TYPE": "float",
      "DEFAULT": 5.0,
      "MIN": 0.0,
      "MAX": 15.0,
      "LABEL": "Delay"
    }
  ],
  "PASSES": [
    { "TARGET": "buffer0",  "PERSISTENT": true },
    { "TARGET": "buffer1",  "PERSISTENT": true },
    { "TARGET": "buffer2",  "PERSISTENT": true },
    { "TARGET": "buffer3",  "PERSISTENT": true },
    { "TARGET": "buffer4",  "PERSISTENT": true },
    { "TARGET": "buffer5",  "PERSISTENT": true },
    { "TARGET": "buffer6",  "PERSISTENT": true },
    { "TARGET": "buffer7",  "PERSISTENT": true },
    { "TARGET": "buffer8",  "PERSISTENT": true },
    { "TARGET": "buffer9",  "PERSISTENT": true },
    { "TARGET": "buffer10", "PERSISTENT": true },
    { "TARGET": "buffer11", "PERSISTENT": true },
    { "TARGET": "buffer12", "PERSISTENT": true },
    { "TARGET": "buffer13", "PERSISTENT": true },
    { "TARGET": "buffer14", "PERSISTENT": true },
    { "TARGET": "buffer15", "PERSISTENT": true },
    { }
  ]
}*/

const int BUFFER_COUNT = 16;
const int BUFFER_MASK  = BUFFER_COUNT - 1;

vec4 sampleBuffer(int idx, vec2 uv) {
  switch (idx) {
    case  0:  return IMG_NORM_PIXEL(buffer0,  uv);
    case  1:  return IMG_NORM_PIXEL(buffer1,  uv);
    case  2:  return IMG_NORM_PIXEL(buffer2,  uv);
    case  3:  return IMG_NORM_PIXEL(buffer3,  uv);
    case  4:  return IMG_NORM_PIXEL(buffer4,  uv);
    case  5:  return IMG_NORM_PIXEL(buffer5,  uv);
    case  6:  return IMG_NORM_PIXEL(buffer6,  uv);
    case  7:  return IMG_NORM_PIXEL(buffer7,  uv);
    case  8:  return IMG_NORM_PIXEL(buffer8,  uv);
    case  9:  return IMG_NORM_PIXEL(buffer9,  uv);
    case 10:  return IMG_NORM_PIXEL(buffer10, uv);
    case 11:  return IMG_NORM_PIXEL(buffer11, uv);
    case 12:  return IMG_NORM_PIXEL(buffer12, uv);
    case 13:  return IMG_NORM_PIXEL(buffer13, uv);
    case 14:  return IMG_NORM_PIXEL(buffer14, uv);
    case 15:  return IMG_NORM_PIXEL(buffer15, uv);
    default:  return vec4(0.0);
  }
}

void main() {
  vec2 uv = isf_FragNormCoord;
  int currentIndex = FRAMEINDEX & BUFFER_MASK;
  int delayFrames = int(delay);
  int delayedIndex = (currentIndex - delayFrames) & BUFFER_MASK;

  if (PASSINDEX < BUFFER_COUNT) {
    gl_FragColor = (PASSINDEX == currentIndex)
      ? IMG_NORM_PIXEL(inputImage, uv)
      : sampleBuffer(PASSINDEX, uv);
  } else {
    gl_FragColor = (delayFrames == 0)
      ? IMG_NORM_PIXEL(inputImage, uv)
      : sampleBuffer(delayedIndex, uv);
  }
}