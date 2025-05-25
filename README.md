# 3D Solar System Visualization

This project displays an animated 3D model of our solar system in the browser using Three.js.

## Features

*   **Animated Celestial Bodies:** Planets, moons, and the Sun exhibit orbital and axial rotations.
    *   **Planet Orbits:** Planets orbit the Sun.
    *   **Planet Axial Rotation:** Planets (and the Sun) spin on their axes. Earth's cloud layer also rotates.
    *   **Moon Orbits:** Moons orbit their parent planets.
    *   **Moon Axial Rotation:** Moons spin on their own axes.
*   **Interactive Navigation:**
    *   **Fly Controls:** Free-flight camera navigation using Three.js `FlyControls`, allowing movement in all directions with keyboard (W,A,S,D, R,F for up/down, Q,E for roll) and mouse (drag to change view direction).
    *   **Quick Travel UI:** A dropdown menu allows instant travel to a viewpoint near the Sun or any major planet.
    *   **On-Screen Help:** A panel displays FlyControls commands, and can be closed by the user.
*   **Granular Pause Controls:** Separate on-screen buttons allow toggling of:
    *   Planet orbital movement around the Sun.
    *   Planet axial rotation (including Sun and Earth's clouds).
    *   Moon orbital movement around their parent planet.
    *   Moon axial rotation.
*   **Detailed Moons:** Many planets now feature their major moons:
    *   **Earth:** Accompanied by its Moon, featuring a detailed bump map.
    *   **Mars:** Features its two moons, Phobos and Deimos.
    *   **Jupiter:** Includes its four Galilean moons (Io, Europa, Ganymede, Callisto).
    *   **Saturn:** A selection of its major moons (Titan, Rhea, Enceladus) are represented.
*   **Visual Realism:**
    *   **Starfield Background:** A star texture provides a backdrop.
    *   **Textured Celestial Bodies:** Sun, planets, and major moons are rendered with textures.
    *   **Enhanced Earth Details:** Includes dynamic clouds, city lights on the night side, and surface realism maps (specular/roughness, normal/bump).
    *   **Lighting:** Point light from the Sun, complemented by ambient light.

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
