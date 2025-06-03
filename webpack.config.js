const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const NodePolyfillPlugin = require('node-polyfill-webpack-plugin');
const fs = require("fs");
const { sources } = require("webpack");

module.exports = {
  mode: 'development',
  entry: './animation.js',
  output: {
    filename: 'main.js',
    path: path.resolve(__dirname, 'dist'),
    publicPath: '/',
  },
  module: {
    rules: [
      {
        test: /\.(js|jsx)$/,
        exclude: /node_modules\/(?!(@shopify\/react-native-skia|react-native-reanimated|react-native-web|@react-native|react-native-svg)\/).*/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: [
              '@babel/preset-flow',
              ['@babel/preset-react', { "runtime": "automatic" }],
              '@babel/preset-env',
            ],
          },
        },
      },
      {
        test: /\.(png|jpg|jpeg|gif|svg)$/i,
        type: 'asset/resource',
      },
    ],
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: './index.html',
    }),
    new (class CopySkiaPlugin {
      apply(compiler) {
        compiler.hooks.thisCompilation.tap("AddSkiaPlugin", (compilation) => {
          compilation.hooks.processAssets.tapPromise(
            {
              name: "copy-skia",
              stage: compiler.webpack.Compilation.PROCESS_ASSETS_STAGE_ADDITIONAL,
            },
            async () => {
              const src = require.resolve("canvaskit-wasm/bin/full/canvaskit.wasm");
              const wasmAssetName = 'canvaskit.wasm';
              if (!compilation.getAsset(wasmAssetName)) {
                compilation.emitAsset(wasmAssetName, new sources.RawSource(await fs.promises.readFile(src)));
              }
            }
          );
        });
      }
    })(),
    new NodePolyfillPlugin()
  ],
  resolve: {
    alias: {
      'react-native$': 'react-native-web', // Alias react-native to react-native-web
      'react-native/Libraries/Image/AssetRegistry': false,
    },
    extensions: ['.web.js', '.web.jsx', '.js', '.jsx'],
  },
  devServer: {
    static: {
      directory: path.join(__dirname, 'dist'),
    },
    compress: true,
    port: 9000,
  },
};
