/*{
  "CATEGORIES": [
    "Distortion"
  ],
  "ISFVSN": "2",
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
      "MAX": 1.0,
      "LABEL": "Progress"
    }
  ],
  "CREDIT": "chenkai, ported from Codertw"
}*/

float rand(vec2 co) {
    return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453);
}

// Motion blur for texture from
vec4 motionBlurFrom(vec2 _st, vec2 speed) {
    vec3 color = vec3(0.0);
    float total = 0.0;
    float offset = rand(_st);
    for (float t = 0.0; t <= 20.0; t++) {
        float percent = (t + offset) / 20.0;
        float weight = 4.0 * (percent - percent * percent);
        vec2 newuv = _st + speed * percent;
        newuv = fract(newuv);
        color += IMG_NORM_PIXEL(startImage, newuv).rgb * weight;
        total += weight;
    }
    return vec4(color / total, 1.0);
}

// Motion blur for texture to
vec4 motionBlurTo(vec2 _st, vec2 speed) {
    vec3 color = vec3(0.0);
    float total = 0.0;
    float offset = rand(_st);
    for (float t = 0.0; t <= 20.0; t++) {
        float percent = (t + offset) / 20.0;
        float weight = 4.0 * (percent - percent * percent);
        vec2 newuv = _st + speed * percent;
        newuv = fract(newuv);
        color += IMG_NORM_PIXEL(endImage, newuv).rgb * weight;
        total += weight;
    }
    return vec4(color / total, 1.0);
}

// Bezier easing function
float A(float aA1, float aA2) { return 1.0 - 3.0 * aA2 + 3.0 * aA1; }
float B(float aA1, float aA2) { return 3.0 * aA2 - 6.0 * aA1; }
float C(float aA1) { return 3.0 * aA1; }
float GetSlope(float aT, float aA1, float aA2) { return 3.0 * A(aA1, aA2) * aT * aT + 2.0 * B(aA1, aA2) * aT + C(aA1); }
float CalcBezier(float aT, float aA1, float aA2) { return ((A(aA1, aA2) * aT + B(aA1, aA2)) * aT + C(aA1)) * aT; }
float GetTForX(float aX, float mX1, float mX2) {
    float aGuessT = aX;
    for (int i = 0; i < 4; ++i) {
        float currentSlope = GetSlope(aGuessT, mX1, mX2);
        if (currentSlope == 0.0) return aGuessT;
        float currentX = CalcBezier(aGuessT, mX1, mX2) - aX;
        aGuessT -= currentX / currentSlope;
    }
    return aGuessT;
}
float KeySpline(float aX, float mX1, float mY1, float mX2, float mY2) {
    if (mX1 == mY1 && mX2 == mY2) return aX;
    return CalcBezier(GetTForX(aX, mX1, mX2), mY1, mY2);
}

// Gaussian blur distribution
float normpdf(float x) {
    return exp(-20.0 * pow(x - 0.5, 2.0));
}

// Rotate UV coordinates
vec2 rotateUv(vec2 uv, float angle, vec2 anchor) {
    uv -= anchor;
    float s = sin(angle);
    float c = cos(angle);
    uv = mat2(c, -s, s, c) * uv;
    uv += anchor;
    return uv;
}

void main() {
    vec2 uv = isf_FragNormCoord;
    vec2 iResolution = vec2(100.0, 100.0); // Screen size
    float ratio = iResolution.x / iResolution.y;

    float animationTime = progress;
    float easingTime = KeySpline(animationTime, 0.68, 0.01, 0.17, 0.98);
    float blur = normpdf(easingTime);
    float rotation = radians(180.0);
    float r = (easingTime <= 0.5) ? rotation * easingTime : -rotation + rotation * easingTime;

    // Apply rotation for current frame
    vec2 mystCurrent = uv;
    mystCurrent.y *= 1.0 / ratio;
    mystCurrent = rotateUv(mystCurrent, r, vec2(1.0, 0.0));
    mystCurrent.y *= ratio;

    // Time interval by fps=30
    float timeInterval = 0.0167 * 2.0;
    r = (easingTime <= 0.5) ? rotation * (easingTime + timeInterval) : -rotation + rotation * (easingTime + timeInterval);

    // Rotation for next frame
    vec2 mystNext = uv;
    mystNext.y *= 1.0 / ratio;
    mystNext = rotateUv(mystNext, r, vec2(1.0, 0.0));
    mystNext.y *= ratio;

    // Calculate tangent motion speed
    vec2 speed = (mystNext - mystCurrent) / timeInterval * blur * 0.5;

    // Apply motion blur effect
    if (easingTime <= 0.5) {
        gl_FragColor = motionBlurFrom(mystCurrent, speed);
    } else {
        gl_FragColor = motionBlurTo(mystCurrent, speed);
    }
}
