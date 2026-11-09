/*{
  "DESCRIPTION": "TV static",
  "CREDIT": "Projection Mapping Web",
  "ISFVSN": "2",
  "CATEGORIES": [
    "Noise"
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
      "NAME": "grain",
      "LABEL": "Grain size",
      "TYPE": "float",
      "DEFAULT": 1.0,
      "MIN": 1.0,
      "MAX": 16.0
    }
  ]
}*/
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void main() {
  vec2 cell = floor(gl_FragCoord.xy / grain);
  float v = hash(cell + fract(TIME * 13.17) * 100.0);
  gl_FragColor = mix(color2, color1, v);
}
