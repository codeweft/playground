// Wait for the DOM to be fully loaded
document.addEventListener('DOMContentLoaded', () => {
    // Get the canvas element
    const canvas = document.getElementById('solarSystemCanvas');

    // Scene
    const scene = new THREE.Scene();

    // Camera
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.z = 70; // Adjusted camera for better overview

    // Renderer
    const renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);

    // Sun
    const sunGeometry = new THREE.SphereGeometry(5, 32, 32);
    const sunMaterial = new THREE.MeshBasicMaterial({ color: 0xFFFF00 });
    const sun = new THREE.Mesh(sunGeometry, sunMaterial);
    scene.add(sun);

    // Point Light for the Sun
    const pointLight = new THREE.PointLight(0xFFFFFF, 2.0, 1000); // Brighter and further reaching
    pointLight.position.set(0, 0, 0);
    scene.add(pointLight);

    // Ambient light for overall scene illumination
    const ambientLight = new THREE.AmbientLight(0x404040, 0.7); // Soft white light, slightly brighter
    scene.add(ambientLight);

    // Orbit Controls
    const controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; 
    controls.dampingFactor = 0.05;
    // controls.minDistance = 10; 
    // controls.maxDistance = 200;

    const planets = []; // Array to hold planet data for animation
    const clock = new THREE.Clock(); // For time-based animation (optional, but good practice)

    // Mercury
    const mercuryOrbit = new THREE.Object3D();
    scene.add(mercuryOrbit);
    const mercuryGeometry = new THREE.SphereGeometry(0.5, 32, 32);
    const mercuryMaterial = new THREE.MeshStandardMaterial({ color: 0x888888 });
    const mercury = new THREE.Mesh(mercuryGeometry, mercuryMaterial);
    mercury.position.x = 10;
    mercuryOrbit.add(mercury);
    planets.push({ mesh: mercury, orbit: mercuryOrbit, speed: 0.01, rotationSpeed: 0.05 });

    // Venus
    const venusOrbit = new THREE.Object3D();
    scene.add(venusOrbit);
    const venusGeometry = new THREE.SphereGeometry(0.9, 32, 32);
    const venusMaterial = new THREE.MeshStandardMaterial({ color: 0xFFE4B5 });
    const venus = new THREE.Mesh(venusGeometry, venusMaterial);
    venus.position.x = 15;
    venusOrbit.add(venus);
    planets.push({ mesh: venus, orbit: venusOrbit, speed: 0.007, rotationSpeed: 0.03 });

    // Earth
    const earthOrbit = new THREE.Object3D();
    scene.add(earthOrbit);
    const earthGeometry = new THREE.SphereGeometry(1, 32, 32);
    const earthMaterial = new THREE.MeshStandardMaterial({ color: 0x4682B4 });
    const earth = new THREE.Mesh(earthGeometry, earthMaterial);
    earth.position.x = 20;
    earthOrbit.add(earth);
    planets.push({ mesh: earth, orbit: earthOrbit, speed: 0.005, rotationSpeed: 0.02 });

    // Mars
    const marsOrbit = new THREE.Object3D();
    scene.add(marsOrbit);
    const marsGeometry = new THREE.SphereGeometry(0.7, 32, 32);
    const marsMaterial = new THREE.MeshStandardMaterial({ color: 0xFF4500 });
    const mars = new THREE.Mesh(marsGeometry, marsMaterial);
    mars.position.x = 25;
    marsOrbit.add(mars);
    planets.push({ mesh: mars, orbit: marsOrbit, speed: 0.004, rotationSpeed: 0.025 });

    // Jupiter
    const jupiterOrbit = new THREE.Object3D();
    scene.add(jupiterOrbit);
    const jupiterGeometry = new THREE.SphereGeometry(3.5, 32, 32);
    const jupiterMaterial = new THREE.MeshStandardMaterial({ color: 0xD2B48C });
    const jupiter = new THREE.Mesh(jupiterGeometry, jupiterMaterial);
    jupiter.position.x = 35;
    jupiterOrbit.add(jupiter);
    planets.push({ mesh: jupiter, orbit: jupiterOrbit, speed: 0.002, rotationSpeed: 0.01 });
   
    // Saturn
    const saturnOrbit = new THREE.Object3D();
    scene.add(saturnOrbit);
    const saturnGeometry = new THREE.SphereGeometry(3, 32, 32);
    const saturnMaterial = new THREE.MeshStandardMaterial({ color: 0xF0E68C });
    const saturn = new THREE.Mesh(saturnGeometry, saturnMaterial);
    saturn.position.x = 45; 
    saturnOrbit.add(saturn); 
    
    const ringGeometry = new THREE.RingGeometry(3.5, 6, 64); // InnerR, OuterR, Segments
    // Using MeshStandardMaterial for rings as well for consistent lighting
    const ringMaterial = new THREE.MeshStandardMaterial({ color: 0xAAA08C, side: THREE.DoubleSide, metalness: 0.3, roughness: 0.8 });
    const saturnRings = new THREE.Mesh(ringGeometry, ringMaterial);
    saturnRings.rotation.x = Math.PI / 2.5; // Tilt the rings
    saturnRings.position.x = 0; // Rings are centered on Saturn's mesh
    saturn.add(saturnRings); // Add rings as a child of Saturn's mesh
    planets.push({ mesh: saturn, orbit: saturnOrbit, speed: 0.001, rotationSpeed: 0.009, rings: saturnRings });

    // Uranus
    const uranusOrbit = new THREE.Object3D();
    scene.add(uranusOrbit);
    const uranusGeometry = new THREE.SphereGeometry(2, 32, 32);
    const uranusMaterial = new THREE.MeshStandardMaterial({ color: 0xAFEEEE });
    const uranus = new THREE.Mesh(uranusGeometry, uranusMaterial);
    uranus.position.x = 55;
    uranusOrbit.add(uranus);
    planets.push({ mesh: uranus, orbit: uranusOrbit, speed: 0.0007, rotationSpeed: 0.015 });

    // Neptune
    const neptuneOrbit = new THREE.Object3D();
    scene.add(neptuneOrbit);
    const neptuneGeometry = new THREE.SphereGeometry(1.9, 32, 32);
    const neptuneMaterial = new THREE.MeshStandardMaterial({ color: 0x3F51B5 });
    const neptune = new THREE.Mesh(neptuneGeometry, neptuneMaterial);
    neptune.position.x = 65;
    neptuneOrbit.add(neptune);
    planets.push({ mesh: neptune, orbit: neptuneOrbit, speed: 0.0005, rotationSpeed: 0.012 });

    // Animation loop
    function animate() {
        requestAnimationFrame(animate);

        // Sun rotation
        sun.rotation.y += 0.0005; // Slower sun rotation

        // Planets animation
        planets.forEach(p => {
            p.orbit.rotation.y += p.speed;       // Orbital movement
            p.mesh.rotation.y += p.rotationSpeed; // Axial rotation
        });

        controls.update(); // Update controls in the animation loop

        renderer.render(scene, camera);
    }

    // Handle window resize
    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });

    // Start animation
    animate();

    console.log('Three.js setup complete with orbital and axial rotation.');
});
