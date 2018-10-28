import canvasSketch from "canvas-sketch";
import createRegl from "regl";
import glslify from "glslify";
import mat4 from "gl-mat4";
import vec3 from "gl-vec3";
import calculateBarycentrics from "glsl-solid-wireframe";
import { math } from "canvas-sketch-util";
import chunk from "lodash/chunk";

import Grid from "./Grid";

const settings = {
    context: "webgl",
    // Enable MSAA in WebGL
    attributes: {
        antialias: true
    },
    // dimensions: [2448, 248],
    animate: true
};

const params = {
    backgroundColor: new Float32Array([0, 0, 0.2, 1]),
    meshColor: new Float32Array([0.6, 0.1, 0.6, 1]),
    lineThickness: 0.5,
    isSameAsBackgroundColor: false,
    inverse: true
};

const vert = glslify`    
    precision highp float;

    uniform mat4 uProjection, uView, uRotate;
    uniform float uTime;
    
    attribute vec3 aPosition;
    attribute vec2 aUv;
    attribute vec2 aBarycentric;
    attribute vec3 aNormal;

    varying vec2 vB;
    // varying float vNoise;
    varying vec3 vDisplacementZ;

    #pragma glslify: _cnoise4 = require(glsl-noise/classic/4d)

    void main () {
        float r = _cnoise4(vec4(0.05 * aPosition + vec3(uTime ), vec3( 50. )));
        mat4 modelView = uProjection * uView;
        vec3 scaledNormal = aNormal * 3.;
        vec3 displacement = aPosition + scaledNormal * _cnoise4(vec4(aPosition, uTime)) * r;

        vB = aBarycentric;
        vDisplacementZ = displacement;

        gl_Position = modelView * uRotate * vec4(displacement, 1.);
    }
`;

const frag = glslify`
    precision highp float;
    #extension GL_OES_standard_derivatives : enable

    uniform vec4 uBackgroundColor;
    uniform vec4 uMeshColor;
    uniform float uLineThickness;
    uniform bool uIsSameAsBackgroundColor;
    uniform bool uInverse;

    varying vec2 vB;
    varying float vNoise;
    varying vec3 vDisplacementZ;

    // #pragma glslify: grid = require(glsl-solid-wireframe/barycentric/scaled)
    // http://codeflow.org/entries/2012/aug/02/easy-wireframe-display-with-barycentric-coordinates/
    float _gridFactor (vec2 vBC, float width, float feather) {
        float w1 = width - feather * 0.5;
        vec3 bary = vec3(vBC.x, vBC.y, 1.0 - vBC.x - vBC.y);
        vec3 d = fwidth(bary);
        vec3 a3 = smoothstep(d * w1, d * (w1 + feather), bary);
        return min(min(a3.x, a3.y), a3.z);
    }
    
    void main () {
        vec3 wireColor;
        if (uIsSameAsBackgroundColor) {
            wireColor = uBackgroundColor.rgb;
        } else {
            wireColor = uMeshColor.rgb;
        }
        
        if(uInverse) {
            wireColor *= mix(uBackgroundColor.rgb, wireColor * vec3(vDisplacementZ.z * 10.), vec3(vDisplacementZ.z));
        } else {
            wireColor *= mix(wireColor * vec3(vDisplacementZ.z * 10.), uBackgroundColor.rgb, vec3(vDisplacementZ.z));
        }
        
        vec3 barycentric = mix(
            wireColor, 
            uBackgroundColor.rgb, 
            vec3(_gridFactor(vB, uLineThickness, 1.))
        );

        // float fogFactor = clamp((uFog))
        
        gl_FragColor = vec4(barycentric, 1.);
    }
`;

canvasSketch(({ gl }) => {
    const {
        backgroundColor,
        meshColor,
        lineThickness,
        isSameAsBackgroundColor,
        inverse
    } = params;
    const regl = createRegl({
        gl,
        extensions: ["OES_standard_derivatives"]
    });

    // FIXME: Last 2 parameters not working, probably because of grid code
    // Something goes wrong with counting vertices
    // It does work with times 4 (so 10, 40, 160)
    const grid = new Grid(100, 100, 160, 160);

    const { barycentric } = calculateBarycentrics({
        positions: grid.positions,
        // HINT:
        // Expects [[x, y, z], [x ,y ,z]] vector arrays
        // but we have [x, y, z, x, y, z]
        cells: chunk(grid.cells, 3)
    });

    const drawGrid = regl({
        vert,
        frag,
        attributes: {
            aPosition: grid.positions,
            aUv: grid.uvs,
            aBarycentric: barycentric,
            aNormal: grid.normals
        },
        elements: grid.cells,
        uniforms: {
            uView: context => {
                const t = 0.01 * context.tick;

                return mat4.lookAt(
                    [],
                    // Vec3 eye
                    [40 * Math.cos(t * 0.5), 5 * Math.sin(t), -50],
                    // [0, 0, -90],
                    // Vec3 center
                    [0, 0, 0],
                    // Vec3 UP
                    [0, 1, 0]
                );
            },
            uProjection: ({ viewportWidth, viewportHeight }) =>
                mat4.perspective(
                    [],
                    Math.PI / 4,
                    viewportWidth / viewportHeight,
                    0.01,
                    1000
                ),
            uRotate: context => {
                const rotationYMatrix = mat4.create();
                mat4.rotateX(
                    rotationYMatrix,
                    rotationYMatrix,
                    math.degToRad(70)
                );

                return rotationYMatrix;
            },
            uBackgroundColor: backgroundColor,
            uMeshColor: meshColor,
            uLineThickness: lineThickness,
            uIsSameAsBackgroundColor: isSameAsBackgroundColor,
            uInverse: inverse,
            uTime: context => {
                return 0.01 * context.tick;
            }
        },
        depth: {
            enable: true
        }
        // FIXME: Renders extra positions??
        // count: grid.positions.length
    });

    return () => {
        // Update regl sizes
        regl.poll();

        regl.clear({
            color: backgroundColor,
            depth: 1
        });
        drawGrid();
    };
}, settings);
