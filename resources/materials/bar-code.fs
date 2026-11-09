/*{
  "DESCRIPTION": "Scrolling bars of random widths",
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
      "NAME": "density",
      "LABEL": "Density",
      "TYPE": "float",
      "DEFAULT": 60.0,
      "MIN": 10.0,
      "MAX": 200.0
    },
    {
      "NAME": "speed",
      "LABEL": "Speed",
      "TYPE": "float",
      "DEFAULT": 0.2,
      "MIN": 0.0,
      "MAX": 2.0
    }
  ]
}*/
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void main() {
  float x = isf_FragNormCoord.x * density + TIME * speed * density * 0.1;
  float id = floor(x);
  float on = step(0.45, hash(vec2(id, 1.0)));
  float edge = step(0.12, fract(x));
  gl_FragColor = mix(color2, color1, on * edge);
}
