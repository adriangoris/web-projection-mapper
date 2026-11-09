/*{
  "DESCRIPTION": "A sliding checkerboard",
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
      "NAME": "squares",
      "LABEL": "Squares",
      "TYPE": "float",
      "DEFAULT": 8.0,
      "MIN": 1.0,
      "MAX": 64.0
    },
    {
      "NAME": "speed",
      "LABEL": "Speed",
      "TYPE": "float",
      "DEFAULT": 0.25,
      "MIN": 0.0,
      "MAX": 3.0
    }
  ]
}*/
void main() {
  vec2 uv = isf_FragNormCoord * vec2(RENDERSIZE.x / RENDERSIZE.y, 1.0) * squares;
  uv += vec2(TIME * speed, TIME * speed * 0.5);
  float v = mod(floor(uv.x) + floor(uv.y), 2.0);
  gl_FragColor = mix(color2, color1, v);
}
