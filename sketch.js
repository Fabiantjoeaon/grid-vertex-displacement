import canvasSketch from "canvas-sketch";
import createRegl from "regl";
import glslify from "glslify";
import mat4 from "gl-mat4";
import vec3 from "gl-vec3";
import calculateBarycentrics from "glsl-solid-wireframe";
import { math } from "canvas-sketch-util";
import chunk from "lodash/chunk";
import * as dat from "dat.gui";

document.body.style.padding = "0px";
document.body.style.margin = "0px";
document.documentElement.style.padding = "0px";
document.documentElement.style.margin = "0px";

const gui = new dat.GUI();

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

const preset = [];

const params = {
    backgroundColor: [0, 0, 51],
    meshColor: [153, 25, 153],
    lineThickness: 0.5,
    isSameAsBackgroundColor: false,
    inverse: true,
    fogDistance: [0, 140],
    displacement: 6
};

const updateUniforms = (val, key) => (params[key] = val);
const mapColor = color => color.map(c => math.mapRange(c, 0, 255, 0, 1));

gui.addColor(params, "backgroundColor").onChange(val => {
    updateUniforms(val, "backgroundColor");
});
gui.addColor(params, "meshColor").onChange(val => {
    updateUniforms(val, "meshColor");
});
gui.add(params, "displacement")
    .min(1)
    .max(20)
    .onChange(val => {
        updateUniforms(val, "displacement");
    });
gui.add(params, "lineThickness")
    .min(0.1)
    .max(3.5)
    .onChange(val => {
        updateUniforms(val, "lineThickness");
    });

const vert = glslify`    
    precision highp float;

    uniform mat4 uProjection, uView, uRotate;
    uniform float uTime;
    uniform vec3 uEye;
    uniform float uDisplacement;
    
    attribute vec3 aPosition;
    attribute vec2 aUv;
    attribute vec2 aBarycentric;
    attribute vec3 aNormal;

    varying vec2 vB;
    // varying float vNoise;
    varying vec3 vDisplacementZ;
    varying float vDistanceFromEye;

    #pragma glslify: _cnoise4 = require(glsl-noise/classic/4d)

    void main () {
        float r = _cnoise4(vec4(0.05 * aPosition + vec3(uTime ), vec3( 100. )));
        mat4 modelView = uProjection * uView;
        vec3 scaledNormal = aNormal * uDisplacement;
        vec3 displacement = aPosition + scaledNormal * _cnoise4(vec4(aPosition, uTime)) * r;

        vB = aBarycentric;
        vDisplacementZ = displacement;
        vDistanceFromEye = distance(vec3(uProjection * vec4(aPosition, 1.)), uEye);

        gl_Position = modelView * uRotate * vec4(displacement, 1.);
    }
`;

const frag = glslify`
    precision highp float;
    #extension GL_OES_standard_derivatives : enable

    uniform vec3 uBackgroundColor;
    uniform vec3 uMeshColor;
    uniform float uLineThickness;
    uniform bool uIsSameAsBackgroundColor;
    uniform bool uInverse;
    uniform vec2 uFogDist;

    varying vec2 vB;
    varying float vNoise;
    varying vec3 vDisplacementZ;
    varying float vDistanceFromEye;

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
            wireColor = uBackgroundColor;
        } else {
            wireColor = uMeshColor;
        }
        
        if(uInverse) {
            wireColor *= mix(uBackgroundColor, wireColor * vec3(vDisplacementZ.z * 10.), vec3(vDisplacementZ.z));
        } else {
            wireColor *= mix(wireColor * vec3(vDisplacementZ.z * 10.), uBackgroundColor, vec3(vDisplacementZ.z));
        }
        
        vec3 finalGrid = mix(
            wireColor, 
            uBackgroundColor, 
            vec3(_gridFactor(vB, uLineThickness, 1.))
        );

        // FOG
        float fogFactor = clamp((uFogDist.y - vDistanceFromEye) / uFogDist.y - uFogDist.x, 0.0, 1.0);

        vec3 color = mix(uBackgroundColor, finalGrid, fogFactor);
        
        gl_FragColor = vec4(color, 1.);
    }
`;

canvasSketch(({ gl }) => {
    const { isSameAsBackgroundColor, inverse, fogDistance } = params;
    const regl = createRegl({
        gl,
        extensions: ["OES_standard_derivatives"]
    });

    // FIXME: Last 2 parameters not working, probably because of grid code
    // Something goes wrong with counting vertices
    // It does work with times 4 (so 10, 40, 160)
    // Could it be a missing final vector value for position?
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
            uView: (context, { eye }) =>
                mat4.lookAt(
                    [],
                    // Vec3 eye
                    eye,
                    // [0, 0, -90],
                    // Vec3 center
                    [0, 0, 0],
                    // Vec3 UP
                    [0, 1, 0]
                ),
            // Is this the model matrix or the projection matrix?
            // The fog algorithm expects the model matrix, but passing
            // a projections matrix works just fine
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
            uTime: (_context, { time }) => time,
            uDisplacement: (_context, { displacement }) => displacement,
            uFogDist: fogDistance,
            uEye: (_context, { eye }) => new Float32Array(eye),
            uBackgroundColor: (_context, { backgroundColor }) =>
                new Float32Array(backgroundColor),
            uMeshColor: (_context, { meshColor }) =>
                new Float32Array(meshColor),
            uLineThickness: (_context, { lineThickness }) => lineThickness,
            uInverse: inverse,
            uIsSameAsBackgroundColor: isSameAsBackgroundColor
        },
        depth: {
            enable: true
        }
        // FIXME: Renders extra positions??
        // count: grid.positions.length
    });

    return ({ time }) => {
        const {
            meshColor,
            backgroundColor,
            displacement,
            lineThickness
        } = params;
        // Update regl sizes
        regl.poll();

        console.log(mapColor(backgroundColor));

        regl.clear({
            color: [...mapColor(backgroundColor), 1],
            depth: 1
        });

        drawGrid({
            time: time * 0.5,
            eye: [40 * Math.cos(time * 0.5), 5 * Math.sin(time), -70],
            backgroundColor: mapColor(backgroundColor),
            meshColor: mapColor(meshColor),
            displacement,
            lineThickness
        });
    };
}, settings);
