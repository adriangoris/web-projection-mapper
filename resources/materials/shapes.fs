/*{
  "DESCRIPTION": "A grid of squares that grow and shrink",
  "CREDIT": "Projection Mapping Web",
  "ISFVSN": "2",
  "CATEGORIES": [
    "Pattern"
  ],
  "INPUTS": [
    {
      "NAME": "color1",
      "LABEL": "Color",
      "TYPE": "color",
      "DEFAULT": [
        1,
        1,
        1,
        1
      ]
    },
    {
      "NAME": "color2",
      "LABEL": "Background",
      "TYPE": "color",
      "DEFAULT": [
        0,
        0,
        0,
        1
      ]
    },
    {
      "NAME": "cells",
      "LABEL": "Cells",
      "TYPE": "float",
      "DEFAULT": 6.0,
      "MIN": 2.0,
      "MAX": 24.0
    },
    {
      "NAME": "speed",
      "LABEL": "Speed",
      "TYPE": "float",
      "DEFAULT": 1.0,
      "MIN": 0.0,
      "MAX": 5.0
    }
  ]
}*/
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void main() {
  vec2 uv = isf_FragNormCoord * vec2(RENDERSIZE.x / RENDERSIZE.y, 1.0) * cells;
  vec2 id = floor(uv);
  vec2 g = fract(uv) - 0.5;
  float r = hash(id);
  float size = 0.45 * pow(0.5 + 0.5 * sin(TIME * speed * (0.5 + r) + r * 6.28), 2.0);
  float box = step(max(abs(g.x), abs(g.y)), size);
  gl_FragColor = mix(color2, color1, box);
}
