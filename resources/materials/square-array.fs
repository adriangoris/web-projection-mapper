/*{
  "DESCRIPTION": "Blocks of light flickering across a grid",
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
      "NAME": "columns",
      "LABEL": "Columns",
      "TYPE": "float",
      "DEFAULT": 16.0,
      "MIN": 2.0,
      "MAX": 64.0
    },
    {
      "NAME": "rows",
      "LABEL": "Rows",
      "TYPE": "float",
      "DEFAULT": 10.0,
      "MIN": 2.0,
      "MAX": 64.0
    },
    {
      "NAME": "rate",
      "LABEL": "Rate",
      "TYPE": "float",
      "DEFAULT": 4.0,
      "MIN": 0.1,
      "MAX": 20.0
    }
  ]
}*/
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void main() {
  vec2 uv = isf_FragNormCoord * vec2(columns, rows);
  vec2 id = floor(uv);
  float t = floor(TIME * rate + hash(id) * 4.0);
  float v = hash(id + t);
  v = v > 0.6 ? 1.0 : (v > 0.35 ? 0.45 : 0.0);
  gl_FragColor = mix(color2, color1, v);
}
