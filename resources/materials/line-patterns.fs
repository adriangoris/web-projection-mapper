/*{
  "DESCRIPTION": "Vertical lines of different widths sliding sideways",
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
      "DEFAULT": 24.0,
      "MIN": 4.0,
      "MAX": 80.0
    },
    {
      "NAME": "speed",
      "LABEL": "Speed",
      "TYPE": "float",
      "DEFAULT": 0.3,
      "MIN": 0.0,
      "MAX": 3.0
    }
  ]
}*/
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void main() {
  float x = isf_FragNormCoord.x * density + TIME * speed * density * 0.25;
  float id = floor(x);
  float w = hash(vec2(id, 3.0));
  float line = step(fract(x), w * w);
  float fade = 0.4 + 0.6 * hash(vec2(id, 7.0));
  gl_FragColor = mix(color2, color1, line * fade);
}
