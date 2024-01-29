import {
  Viewer,
  Cartesian3,
  Math,
  Terrain,
  Cesium3DTileset,
  Ion,
  includesReverseAxis,
  Model,
  PrimitiveCollection,
  Primitive,
  PerInstanceColorAppearance,
  Matrix4,
  Quaternion,
  GeometryAttribute,
  PrimitiveType,
  BoundingSphere,
  ColorGeometryInstanceAttribute,
  Color,
  ComponentDatatype,
  GeometryInstance,
  Geometry,
  Transforms
} from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";
import "./css/main.css";

import { IfcAPI } from "web-ifc";
// const { IfcAPI } = require('web-ifc')
// CesiumJS has a default access token built in but it's not meant for active use.
// please set your own access token can be found at: https://cesium.com/ion/tokens.
Ion.defaultAccessToken =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiI1MmVjMGM5Yy1kOTU4LTQzNjYtYWM0Yy1hY2E4ZmJlMGMwM2UiLCJpZCI6MTUwNDcxLCJpYXQiOjE2ODgxMjQ1MTR9.UppNfVjKb3Dt9Z5fONTlUA1uzifI7nz3rG_7ubJtxIg";

// Initialize the Cesium Viewer in the HTML element with the `cesiumContainer` ID.
const viewer = new Viewer("cesiumContainer", {
  terrain: Terrain.fromWorldTerrain(),
});

const ifcApi = new IfcAPI();
ifcApi.SetWasmPath("asset/wasm/");
ifcApi.Init();

function getFormat(uri) {
  const parts = uri.split(/\./g);
  const format = parts[parts.length - 1];
  return format;
}

const loadIfc = async (url) => {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const ifcFile = await response.arrayBuffer();
  const uintFile = new Uint8Array(ifcFile);
  return uintFile;
};

const extractCapabilities = async (ifcApi, url) => {
  const ifcFile = await loadIfc(url);
  const modelID = ifcApi.OpenModel(ifcFile);
  const version =
    ifcApi.GetModelSchema(modelID) !== undefined
      ? ifcApi.GetModelSchema(modelID)
      : "Model schema not defined";
  const format = getFormat(url || "Format not defined");
  const properties = {};
  ifcApi.CloseModel(modelID);
  console.log("version", version);
  console.log("format", format);
  console.log("properties", properties);
  return {
    version,
    format,
    properties,
  };
};

const ifcDataToJSON = async ({ data, ifcApi }) => {
  const settings = {
    COORDINATE_TO_ORIGIN: true,
    USE_FAST_BOOLS: true,
  };
  const modelID = ifcApi.OpenModel(data);
  ifcApi.LoadAllGeometry(modelID);
  const coordinationMatrix = ifcApi.GetCoordinationMatrix(modelID);
  let meshes = [];
  let minx = Infinity;
  let maxx = -Infinity;
  let miny = Infinity;
  let maxy = -Infinity;
  let minz = Infinity;
  let maxz = -Infinity;
  ifcApi.StreamAllMeshes(modelID, (mesh) => {
    const placedGeometries = mesh.geometries;
    let geometry = [];
    for (let i = 0; i < placedGeometries.size(); i++) {
      const placedGeometry = placedGeometries.get(i);
      const ifcGeometry = ifcApi.GetGeometry(
        modelID,
        placedGeometry.geometryExpressID,
      ); // eslint-disable-line
      const ifcVertices = ifcApi.GetVertexArray(
        ifcGeometry.GetVertexData(),
        ifcGeometry.GetVertexDataSize(),
      ); // eslint-disable-line
      const ifcIndices = ifcApi.GetIndexArray(
        ifcGeometry.GetIndexData(),
        ifcGeometry.GetIndexDataSize(),
      ); // eslint-disable-line
      const positions = new Float64Array(ifcVertices.length / 2);
      const normals = new Float32Array(ifcVertices.length / 2);
      for (let j = 0; j < ifcVertices.length; j += 6) {
        const x = ifcVertices[j]; // index = 0
        const y = ifcVertices[j + 1]; // index = 1
        const z = ifcVertices[j + 2]; // index = 2
        if (x < minx) {
          minx = x;
        }
        if (y < miny) {
          miny = y;
        }
        if (z < minz) {
          minz = z;
        }
        if (x > maxx) {
          maxx = x;
        }
        if (y > maxy) {
          maxy = y;
        }
        if (z > maxz) {
          maxz = z;
        }
        positions[j / 2] = x;
        positions[j / 2 + 1] = y;
        positions[j / 2 + 2] = z;
        normals[j / 2] = ifcVertices[j + 3]; // index = 3
        normals[j / 2 + 1] = ifcVertices[j + 4]; // index = 4
        normals[j / 2 + 2] = ifcVertices[j + 5]; // index = 5
      }
      geometry.push({
        color: placedGeometry.color,
        positions,
        normals,
        indices: Array.from(ifcIndices),
        flatTransformation: placedGeometry.flatTransformation,
      });
      ifcGeometry.delete();
    }

    const propertyLines = ifcApi.GetLine(modelID, mesh.expressID); // eslint-disable-line
    meshes.push({
      geometry,
      id: mesh.expressID,
      properties: Object.keys(propertyLines).reduce((acc, key) => {
        return {
          ...acc,
          [key]: propertyLines[key]?.value || propertyLines[key],
        };
      }, {}),
    });
  });
  ifcApi.CloseModel(modelID);
  return {
    meshes,
    extent: [minx, miny, maxx, maxy, minz, maxz],
    center: [
      minx + (maxx - minx) / 2,
      miny + (maxy - miny) / 2,
      minz + (maxz - minz) / 2,
    ],
    size: [maxx - minx, maxy - miny, maxz - minz],
  };
};

const loadIfcModel = async (url) => {
  const data = await loadIfc(url);
  const modelID = ifcApi.OpenModel(data);
  const capabilities = await extractCapabilities(ifcApi, url);
  let bbox = {
    bounds:
      capabilities.version !== "IFC4"
        ? {
            minx: 0 - 0.001,
            miny: 0 - 0.001,
            maxx: 0 + 0.001,
            maxy: 0 + 0.001,
          }
        : {
            minx: 0 - 0.001,
            miny: 0 - 0.001,
            maxx: 0 + 0.001,
            maxy: 0 + 0.001,
          },
    crs: "EPSG:4326",
  };
  return { modelData: data, ...capabilities, ...(bbox && { bbox }) };
};

const updatePrimitivesPosition = (primitives, center) => {
  for (let i = 0; i < primitives.length; i++) {
      const primitive = primitives.get(i);
      primitive.modelMatrix = Transforms.eastNorthUpToFixedFrame(
          // review the center properties
          // based on other existing layer parameters
          Cartesian3.fromDegrees(...(center ? [
              center[0],
              center[1],
              center[2]
          ] : [0, 0, 0]))
      );
  }
};

const getGeometryInstances = ({
  meshes
}) => {
  return meshes
      .map((mesh) => mesh.geometry.map(({
          color,
          positions,
          normals,
          indices,
          flatTransformation
      }) => {
          const rotationMatrix = Matrix4.fromTranslationQuaternionRotationScale(
              new Cartesian3(0.0, 0.0, 0.0),       // 0,0
              Quaternion.fromAxisAngle(            // 90 deg
                  new Cartesian3(1.0, 0.0, 0.0),
                  Math.PI / 2
              ),
              new Cartesian3(1.0, 1.0, 1.0),
              new Matrix4()
          );
          const transformedPositions = positions;
          const transformedNormals = normals;
          let geometryInstance =  new GeometryInstance({
              id: mesh.id,
              modelMatrix: Matrix4.multiply(
                  rotationMatrix,
                  flatTransformation,
                  new Matrix4()
              ),
              geometry: new Geometry({
                  attributes: {
                      position: new GeometryAttribute({
                          componentDatatype: ComponentDatatype.DOUBLE,
                          componentsPerAttribute: 3,
                          values: new Float64Array(transformedPositions)
                      }),
                      normal: new GeometryAttribute({
                          componentDatatype: ComponentDatatype.FLOAT,
                          componentsPerAttribute: 3,
                          values: transformedNormals,
                          normalize: true
                      })
                  },
                  indices,
                  primitiveType: PrimitiveType.TRIANGLES,
                  boundingSphere: BoundingSphere.fromVertices(transformedPositions)
              }),
              attributes: {
                  color: ColorGeometryInstanceAttribute.fromColor(new Color(
                      color.x,
                      color.y,
                      color.z,
                      color.w
                  ))
              }
          });
          geometryInstance.originalOpacity = color.w;
          return geometryInstance;
      })).flat();
};

const createPrimitiveFromMeshes = (meshes, options, center, primitiveName) => {
  const primitive = new Primitive({
      geometryInstances: getGeometryInstances({
          meshes: meshes.filter(mesh => primitiveName === 'translucentPrimitive' ? !mesh.geometry.every(({ color }) => color.w === 1) : !!mesh.geometry.every(({ color }) => color.w === 1)),
          center,
          options
      }),
      releaseGeometryInstances: false,
      appearance: new PerInstanceColorAppearance({
          translucent: primitiveName === 'translucentPrimitive' ? true : false
      }),
      asynchronous: false,
      allowPicking: true
  });
  // see https://github.com/geosolutions-it/MapStore2/blob/9f6f9d498796180ff59679887d300ce51e72a289/web/client/components/map/cesium/Map.jsx#L354-L393
  // primitive._msGetFeatureById = (id) => {
  //     return {
  //         msId: options.id,
  //         feature: {
  //             properties: meshes.find((_mesh) => _mesh.id === id)?.properties || {},
  //             type: 'Feature',
  //             geometry: null
  //         }
  //     };
  // };
  // primitive.msId = options.id;
  // primitive.id = primitiveName;
  return primitive;
};

loadIfcModel("asset/3d/building.ifc").then(async (data) => {
  const ifcAsJSON = await ifcDataToJSON({ data: data.modelData, ifcApi });
  console.log(ifcAsJSON);
  let primitives = new PrimitiveCollection({destroyPrimitives: true});
  const { meshes, center } = ifcAsJSON;
  const translucentPrimitive = createPrimitiveFromMeshes(meshes, {center: [71.4367857, 51.1194751, 400]}, [71.4367857, 51.1194751, 400], 'translucentPrimitive');
  const opaquePrimitive = createPrimitiveFromMeshes(meshes, {center: [71.4367857, 51.1194751, 400]}, [71.4367857, 51.1194751, 400], 'opaquePrimitive');
  primitives.add(translucentPrimitive);
  primitives.add(opaquePrimitive);
  updatePrimitivesPosition(primitives, [71.4367857, 51.1194751, 400])
  console.log(primitives)
  viewer.scene.primitives.add(primitives)
});

// console.log('version', version)
// Fly the camera to San Francisco at the given longitude, latitude, and height.
viewer.camera.flyTo({
  destination: Cartesian3.fromDegrees(71.4367857, 51.1194751, 800),
  orientation: {
    heading: Math.toRadians(0.0),
    pitch: Math.toRadians(-80.0),
  },
});
