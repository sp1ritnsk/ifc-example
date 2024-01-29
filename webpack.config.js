"use strict";

const CopyWebpackPlugin = require("copy-webpack-plugin");
const path = require("path");
const webpack = require("webpack");
const HtmlWebpackPlugin = require("html-webpack-plugin");

const cesiumSource = "node_modules/cesium/Build/Cesium";
const ifcSource = "node_modules/web-ifc";
// this is the base url for static files that CesiumJS needs to load
// Not required but if it's set remember to update CESIUM_BASE_URL as shown below
const cesiumBaseUrl = "cesiumStatic";

module.exports = {
  context: __dirname,
  entry: {
    app: "./src/index.js",
  },
  output: {
    filename: "[contenthash].app.js",
    path: path.resolve(__dirname, "dist"),
    // sourcePrefix: "",
    clean: true,
  },
  resolve: {
    fallback: { https: false, zlib: false, http: false, url: false },
    mainFiles: ["index", "Cesium"],
  },
  module: {
    rules: [
      {
        test: /\.css$/,
        use: ["style-loader", "css-loader"],
      },
      {
        test: /\.(png|gif|jpg|jpeg|svg|xml|json)$/,
        type: "asset/inline",
      },
      {
        test: /\.js$/,
        enforce: "pre",
        include: path.resolve(__dirname, cesiumSource),
        use: [
          {
            loader: "strip-pragma-loader",
            options: {
              pragmas: {
                debug: false,
              },
            },
          },
        ],
      },
      {
        test: /\.wasm$/,
        type: 'asset/resource',
        generator:{
            filename: 'asset/wasm/[name][ext]'
        }
    }
    ],
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: "src/index.html",
    }),
    // Copy Cesium Assets, Widgets, and Workers to a static directory
    new CopyWebpackPlugin({
      patterns: [
        {
          from: path.join(cesiumSource, "Workers"),
          to: `${cesiumBaseUrl}/Workers`,
        },
        {
          from: path.join(cesiumSource, "ThirdParty"),
          to: `${cesiumBaseUrl}/ThirdParty`,
        },
        {
          from: path.join(cesiumSource, "Assets"),
          to: `${cesiumBaseUrl}/Assets`,
        },
        {
          from: path.join(cesiumSource, "Widgets"),
          to: `${cesiumBaseUrl}/Widgets`,
        },
        {
          from: path.join(__dirname, "src", "assets"),
          to: `asset`, 
        },
      ],
    }),
    new webpack.DefinePlugin({
      // Define relative base path in cesium for loading assets
      CESIUM_BASE_URL: JSON.stringify(cesiumBaseUrl),
    }),
  ],
  mode: "development",
  devtool: "eval-source-map",
  experiments: {
    asyncWebAssembly: true,
  },
  devServer: {
    static: path.resolve(__dirname, 'dist'),
    port: 8080,
    open: true,
    hot: true,
 //    watchFiles: true
 },
};
