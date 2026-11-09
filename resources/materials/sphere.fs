/*{
  "DESCRIPTION": "A lit 3D sphere with moving rings",
  "CREDIT": "Projection Mapping Web",
  "ISFVSN": "2",
  "CATEGORIES": [
    "3D"
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
      "NAME": "size",
      "LABEL": "Size",
      "TYPE": "float",
      "DEFAULT": 0.38,
      "MIN": 0.1,
      "MAX": 0.5
    },
    {
      "NAME": "rings",
      "LABEL": "Rings",
      "TYPE": "float",
      "DEFAULT": 10.0,
      "MIN": 0.0,
      "MAX": 40.0
    },
    {
      "NAME": "speed",
      "LABEL": "Speed",
      "TYPE": "float",
      "DEFAULT": 0.5,
      "MIN": 0.0,
      "MAX": 3.0
    }
  ]
}*/
void main() {
  vec2 p = (gl_FragCoord.xy - 0.5 * RENDERSIZE) / RENDERSIZE.y;
  float r = length(p) / size;
  if (r > 1.0) {
    gl_FragColor = color2;
    return;
  }
  vec3 n = vec3(p / size, sqrt(1.0 - r * r));
  vec3 light = normalize(vec3(-0.5, 0.6, 0.8));
  float diffuse = max(dot(n, light), 0.0);
  float spec = pow(max(dot(reflect(-light, n), vec3(0.0, 0.0, 1.0)), 0.0), 32.0);
  float band = 0.75 + 0.25 * sin(n.y * rings * 3.14159 + TIME * speed * 4.0);
  vec3 c = color1.rgb * (0.08 + diffuse * band) + spec * 0.6;
  gl_FragColor = vec4(c, 1.0);
}
