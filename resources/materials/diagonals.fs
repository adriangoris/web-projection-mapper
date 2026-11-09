/*{
  "DESCRIPTION": "Diagonal lines sweeping across",
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
      "NAME": "lines",
      "LABEL": "Lines",
      "TYPE": "float",
      "DEFAULT": 20.0,
      "MIN": 2.0,
      "MAX": 100.0
    },
    {
      "NAME": "thickness",
      "LABEL": "Thickness",
      "TYPE": "float",
      "DEFAULT": 0.3,
      "MIN": 0.02,
      "MAX": 0.9
    },
    {
      "NAME": "speed",
      "LABEL": "Speed",
      "TYPE": "float",
      "DEFAULT": 0.5,
      "MIN": 0.0,
      "MAX": 4.0
    },
    {
      "NAME": "angle",
      "LABEL": "Angle",
      "TYPE": "float",
      "DEFAULT": 45.0,
      "MIN": 0.0,
      "MAX": 180.0
    }
  ]
}*/
void main() {
  float a = radians(angle);
  vec2 uv = isf_FragNormCoord * vec2(RENDERSIZE.x / RENDERSIZE.y, 1.0);
  float d = dot(uv, vec2(cos(a), sin(a))) * lines - TIME * speed * 2.0;
  float v = step(fract(d), thickness);
  gl_FragColor = mix(color2, color1, v);
}
