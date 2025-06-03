import React from 'react';
import { createRoot } from 'react-dom/client';
import { LoadSkiaWeb } from '@shopify/react-native-skia/lib/module/web';
import App from './App';

// Options for locating the wasm file.
const skiaWasmOpts = {
  locateFile: (file) => `/${file}` // Assuming canvaskit.wasm is at the root of the 'dist' folder (served by webpack-dev-server)
};

LoadSkiaWeb(skiaWasmOpts).then(async () => {
  const container = document.getElementById('root'); // Use the new div as the React root
  if (container) {
    const root = createRoot(container);
    root.render(<App />);
  } else {
    console.error("Failed to find the root container for React. Ensure a div with id='root' exists in your HTML.");
  }
}).catch(error => {
  console.error("Failed to load Skia:", error);
});
