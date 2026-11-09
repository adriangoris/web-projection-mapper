/*{
  "DESCRIPTION": "Bars that pop in and out of sequence",
  "CREDIT": "Projection Mapping Web",
  "ISFVSN": "2",
  "CATEGORIES": [
    "Lines"
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
      "NAME": "bars",
      "LABEL": "Bars",
      "TYPE": "float",
      "DEFAULT": 12.0,
      "MIN": 2.0,
      "MAX": 48.0
    },
    {
      "NAME": "rate",
      "LABEL": "Rate",
      "TYPE": "float",
      "DEFAULT": 2.0,
      "MIN": 0.1,
      "MAX": 10.0
    }
  ]
}*/
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void main() {
  float x = isf_FragNormCoord.x * bars;
  float id = floor(x);
  float step_t = floor(TIME * rate);
  float on = step(0.5, hash(vec2(id, step_t)));
  float h = 0.3 + 0.7 * hash(vec2(id, step_t + 17.0));
  float bar = on * step(isf_FragNormCoord.y, h) * step(0.15, fract(x)) * step(fract(x), 0.85);
  gl_FragColor = mix(color2, color1, bar);
}
