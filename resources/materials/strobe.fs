/*{
  "DESCRIPTION": "Flashes on and off",
  "CREDIT": "Projection Mapping Web",
  "ISFVSN": "2",
  "CATEGORIES": [
    "Light"
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
      "NAME": "rate",
      "LABEL": "Flashes per second",
      "TYPE": "float",
      "DEFAULT": 8.0,
      "MIN": 0.5,
      "MAX": 30.0
    },
    {
      "NAME": "duty",
      "LABEL": "On time",
      "TYPE": "float",
      "DEFAULT": 0.5,
      "MIN": 0.05,
      "MAX": 0.95
    }
  ]
}*/
void main() {
  float on = step(fract(TIME * rate), duty);
  gl_FragColor = mix(color2, color1, on);
}
