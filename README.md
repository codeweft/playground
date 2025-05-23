# 3D Solar System Visualization

This project displays an animated 3D model of our solar system in the browser using Three.js.

## Features

*   **Animated Planets:** All eight planets (Mercury, Venus, Earth, Mars, Jupiter, Saturn with rings, Uranus, and Neptune) orbit the Sun.
*   **Axial Rotation:** Planets (and the Sun) rotate on their own axes.
*   **Interactive Camera:** Uses Three.js `OrbitControls` to allow users to:
    *   Orbit the camera around the solar system.
    *   Zoom in and out.
    *   Pan the view.
*   **Basic Lighting:** A point light source emanates from the Sun, illuminating the planets, complemented by ambient light.
*   **Starfield Background:** A dynamic starfield provides a backdrop for the solar system (using a texture or procedural generation).
*   **Textured Celestial Bodies:** The Sun and planets are rendered with textures for a more realistic appearance.
    *   **Enhanced Earth Details:**
        *   **Dynamic Clouds:** A transparent cloud layer, with its own rotation, adds atmospheric depth.
        *   **City Lights:** An emissive map vividly displays city lights on Earth's night side.
        *   **Surface Realism:** Specular (roughness) and normal/bump maps provide a more detailed surface appearance with varied reflectivity and the illusion of terrain.
    *   **Enhanced Moon Details:** Earth's Moon orbits with an added bump map, enhancing crater and surface definition.

## How to View

1.  **Clone the repository (or download the files).**
2.  **Open `index.html` in a modern web browser** that supports WebGL and JavaScript.
    *   No local server is strictly required for this basic setup since all assets are loaded via CDN or are part of the project. Simply opening the file (`file:///path/to/index.html`) should work.

## Technologies Used

*   **HTML5**
*   **CSS3** (minimal, for layout)
*   **JavaScript (ES6+)**
*   **Three.js** (r128, via CDN) for 3D rendering and `OrbitControls`.

## Project Structure

*   `index.html`: The main HTML file that hosts the canvas and scripts.
*   `solar_system.js`: Contains all the JavaScript code for setting up the Three.js scene, creating celestial bodies, animating them, and handling controls.
*   `README.md`: This file.
