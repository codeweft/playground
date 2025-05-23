// Wait for the DOM to be fully loaded
document.addEventListener('DOMContentLoaded', () => {
    // Get the canvas element
    const canvas = document.getElementById('solarSystemCanvas');

    // Scene
    const scene = new THREE.Scene();

    // Starfield
    const textureLoader = new THREE.TextureLoader();
    // Attempt to use a real texture URL found by the worker.
    // Fallback to a simple procedural method if no texture can be loaded or found.
    const starTextureUrl = 'https://www.solarsystemscope.com/textures/download/2k_stars_milky_way.jpg'; // Worker can replace this

    let isOrbitPaused = false; // Variable to control orbital pause state

    textureLoader.load(starTextureUrl, function(texture) {
        const starfieldGeometry = new THREE.SphereGeometry(500, 64, 64); // Large sphere
        const starfieldMaterial = new THREE.MeshBasicMaterial({
            map: texture,
            side: THREE.BackSide
        });
        const starfield = new THREE.Mesh(starfieldGeometry, starfieldMaterial);
        scene.add(starfield);
        console.log('Starfield added with texture.');
    }, undefined, function(err) {
        console.error('Failed to load star texture, creating procedural starfield:', err);
        // Fallback: Procedural starfield (many small points)
        const starVertices = [];
        for (let i = 0; i < 10000; i++) {
            const x = THREE.MathUtils.randFloatSpread(2000); // Spread them out
            const y = THREE.MathUtils.randFloatSpread(2000);
            const z = THREE.MathUtils.randFloatSpread(2000);
            // Only add if far enough to form a sphere-like distribution
            if (Math.sqrt(x*x + y*y + z*z) > 800) { // Ensure they are distant
                 starVertices.push(x, y, z);
            }
        }
        const starsGeometry = new THREE.BufferGeometry();
        starsGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starVertices, 3));
        const starsMaterial = new THREE.PointsMaterial({ color: 0xFFFFFF, size: 1.5 });
        const proceduralStarfield = new THREE.Points(starsGeometry, starsMaterial);
        scene.add(proceduralStarfield);
        console.log('Procedural starfield added.');
    });

    // Camera
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.z = 70; // Adjusted camera for better overview

    // Renderer
    const renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);

    // Sun
    const sunGeometry = new THREE.SphereGeometry(5, 32, 32);
    const sunMaterial = new THREE.MeshBasicMaterial({ color: 0xFFFF00 }); // Fallback color
    textureLoader.load('https://www.solarsystemscope.com/textures/download/2k_sun.jpg', function(texture) {
        sunMaterial.map = texture;
        sunMaterial.needsUpdate = true;
        console.log('Sun texture loaded.');
    }, undefined, function(err) {
        console.error('Error loading Sun texture:', err);
    });
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
    const mercuryMaterial = new THREE.MeshStandardMaterial({ color: 0x888888 }); // Fallback color
    textureLoader.load('https://www.solarsystemscope.com/textures/download/2k_mercury.jpg', function(texture) {
        mercuryMaterial.map = texture;
        mercuryMaterial.needsUpdate = true;
        console.log('Mercury texture loaded.');
    }, undefined, function(err) {
        console.error('Error loading Mercury texture:', err);
    });
    const mercury = new THREE.Mesh(mercuryGeometry, mercuryMaterial);
    mercury.position.x = 10;
    mercuryOrbit.add(mercury);
    planets.push({ mesh: mercury, orbit: mercuryOrbit, speed: 0.01, rotationSpeed: 0.05 });

    // Venus
    const venusOrbit = new THREE.Object3D();
    scene.add(venusOrbit);
    const venusGeometry = new THREE.SphereGeometry(0.9, 32, 32);
    const venusMaterial = new THREE.MeshStandardMaterial({ color: 0xFFE4B5 }); // Fallback color
    textureLoader.load('https://www.solarsystemscope.com/textures/download/2k_venus_surface.jpg', function(texture) {
        venusMaterial.map = texture;
        venusMaterial.needsUpdate = true;
        console.log('Venus texture loaded.');
    }, undefined, function(err) {
        console.error('Error loading Venus texture:', err);
    });
    const venus = new THREE.Mesh(venusGeometry, venusMaterial);
    venus.position.x = 15;
    venusOrbit.add(venus);
    planets.push({ mesh: venus, orbit: venusOrbit, speed: 0.007, rotationSpeed: 0.03 });

    // Earth
    const earthOrbit = new THREE.Object3D();
    scene.add(earthOrbit);
    const earthGeometry = new THREE.SphereGeometry(1, 32, 32);
    const earthMaterial = new THREE.MeshStandardMaterial({ color: 0x4682B4 }); // Fallback color
    textureLoader.load('https://www.solarsystemscope.com/textures/download/2k_earth_daymap.jpg', function(texture) {
        earthMaterial.map = texture;
        earthMaterial.needsUpdate = true;
        console.log('Earth texture loaded.');
    }, undefined, function(err) {
        console.error('Error loading Earth texture:', err);
    });

    // Load Earth's night map (city lights)
    const nightTextureURL = 'https://www.solarsystemscope.com/textures/download/2k_earth_nightmap.jpg';
    textureLoader.load(nightTextureURL, function(texture) {
        earthMaterial.emissiveMap = texture;
        earthMaterial.emissive = new THREE.Color(0xffffff); // Use texture's colors for emission
        earthMaterial.emissiveIntensity = 1.0; // Adjust brightness as needed
        earthMaterial.needsUpdate = true;
        console.log('Earth night map texture loaded.');
    }, undefined, function(err) {
        console.error('Error loading Earth night map texture:', err);
    });

    // Load Earth's specular/roughness map
    const specularTextureURL = 'https://s3-us-west-2.amazonaws.com/s.cdpn.io/297733/earthspec1k.jpg';
    textureLoader.load(specularTextureURL, function(texture) {
        earthMaterial.roughnessMap = texture;
        earthMaterial.roughness = 0.7; // Base roughness, map will modulate this.
        earthMaterial.metalness = 0.1; // Earth is mostly non-metallic.
        earthMaterial.needsUpdate = true;
        console.log('Earth specular/roughness map texture loaded.');
    }, undefined, function(err) {
        console.error('Error loading Earth specular/roughness map texture:', err);
    });

    // Attempt to load Normal Map for Earth
    const normalMapURL = 'https://raw.githubusercontent.com/TarekRaafat/three.js-earth/master/src/textures/earth_normal_map.png';
    textureLoader.load(normalMapURL, function(normalTexture) {
        earthMaterial.normalMap = normalTexture;
        earthMaterial.normalScale = new THREE.Vector2(0.7, 0.7); // Adjust for strength
        earthMaterial.needsUpdate = true;
        console.log('Earth normal map texture loaded.');
    }, undefined, function(err_normal) {
        console.error('Error loading Earth normal map, trying bump map:', err_normal);

        // Fallback to Bump Map if Normal Map fails
        const bumpMapURL = 'https://raw.githubusercontent.com/TarekRaafat/three.js-earth/master/src/textures/earth_bump_map.png';
        textureLoader.load(bumpMapURL, function(bumpTexture) {
            earthMaterial.bumpMap = bumpTexture;
            earthMaterial.bumpScale = 0.05; // Adjust for subtle effect
            earthMaterial.needsUpdate = true;
            console.log('Earth bump map texture loaded.');
        }, undefined, function(err_bump) {
            console.error('Error loading Earth bump map:', err_bump);
        });
    });

    const earth = new THREE.Mesh(earthGeometry, earthMaterial);
    earth.position.x = 20;
    earthOrbit.add(earth);

    // Earth's Clouds
    const cloudGeometry = new THREE.SphereGeometry(earth.geometry.parameters.radius * 1.02, 32, 32);
    const cloudMaterial = new THREE.MeshPhongMaterial({
        transparent: true,
        // depthWrite: false // Optional based on sorting needs
    });
    const cloudTextureURL = 'https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/planets/earth_clouds_1024.png';
    textureLoader.load(cloudTextureURL, function(texture) {
        cloudMaterial.map = texture;
        cloudMaterial.needsUpdate = true;
        console.log('Earth cloud texture loaded.');
    }, undefined, function(err) {
        console.error('Error loading Earth cloud texture:', err);
    });
    const earthClouds = new THREE.Mesh(cloudGeometry, cloudMaterial);
    earth.add(earthClouds); // Add clouds as a child of Earth mesh

    // Earth's Moon
    const moonOrbitPivot = new THREE.Object3D(); // Pivot for Moon's orbit around Earth
    earth.add(moonOrbitPivot); // Add Moon's orbit pivot as a child of Earth's mesh

    const moonRadius = 0.27; // Relative to Earth's radius of 1
    const moonDistance = 3;  // Distance from Earth
    const moonGeometry = new THREE.SphereGeometry(moonRadius, 16, 16); // Smaller sphere, less segments
    const moonMaterial = new THREE.MeshStandardMaterial({ color: 0xCCCCCC }); // Fallback grey

    textureLoader.load('https://www.solarsystemscope.com/textures/download/2k_moon.jpg', function(texture) {
        moonMaterial.map = texture;
        moonMaterial.needsUpdate = true;
        console.log('Moon texture loaded.');
    }, undefined, function(err) {
        console.error('Error loading Moon texture:', err);
    });

    // Load Moon's bump map
    const moonBumpMapURL = 'https://cortex.engr.illinois.edu/cs418/NETID_FinalProject/Assets/Textures/planets/moon_bump.png';
    textureLoader.load(moonBumpMapURL, function(texture) {
        moonMaterial.bumpMap = texture;
        moonMaterial.bumpScale = 0.03; // Subtle crater/surface detail
        moonMaterial.needsUpdate = true;
        console.log('Moon bump map texture loaded.');
    }, undefined, function(err) {
        console.error('Error loading Moon bump map texture:', err);
    });

    const moon = new THREE.Mesh(moonGeometry, moonMaterial);
    moon.position.x = moonDistance; // Position relative to moonOrbitPivot (which is at Earth's center)
    moonOrbitPivot.add(moon); // Add Moon mesh to its pivot

    planets.push({
        mesh: earth,
        orbit: earthOrbit,
        speed: 0.005,
        rotationSpeed: 0.02,
        moonOrbitPivot: moonOrbitPivot, 
        moonOrbitSpeed: 0.05,
        clouds: earthClouds, // Store cloud mesh
        cloudSpeed: 0.0015   // Rotation speed for clouds
    });

    // Mars
    const marsOrbit = new THREE.Object3D();
    scene.add(marsOrbit);
    const marsGeometry = new THREE.SphereGeometry(0.7, 32, 32);
    const marsMaterial = new THREE.MeshStandardMaterial({ color: 0xFF4500 }); // Fallback color
    textureLoader.load('https://www.solarsystemscope.com/textures/download/2k_mars.jpg', function(texture) {
        marsMaterial.map = texture;
        marsMaterial.needsUpdate = true;
        console.log('Mars texture loaded.');
    }, undefined, function(err) {
        console.error('Error loading Mars texture:', err);
    });
    const mars = new THREE.Mesh(marsGeometry, marsMaterial);
    mars.position.x = 25;
    marsOrbit.add(mars);
    planets.push({ mesh: mars, orbit: marsOrbit, speed: 0.004, rotationSpeed: 0.025 });

    // Jupiter
    const jupiterOrbit = new THREE.Object3D();
    scene.add(jupiterOrbit);
    const jupiterGeometry = new THREE.SphereGeometry(3.5, 32, 32);
    const jupiterMaterial = new THREE.MeshStandardMaterial({ color: 0xD2B48C }); // Fallback color
    textureLoader.load('https://www.solarsystemscope.com/textures/download/2k_jupiter.jpg', function(texture) {
        jupiterMaterial.map = texture;
        jupiterMaterial.needsUpdate = true;
        console.log('Jupiter texture loaded.');
    }, undefined, function(err) {
        console.error('Error loading Jupiter texture:', err);
    });
    const jupiter = new THREE.Mesh(jupiterGeometry, jupiterMaterial);
    jupiter.position.x = 35;
    jupiterOrbit.add(jupiter);
    planets.push({ mesh: jupiter, orbit: jupiterOrbit, speed: 0.002, rotationSpeed: 0.01 });
   
    // Saturn
    const saturnOrbit = new THREE.Object3D();
    scene.add(saturnOrbit);
    const saturnGeometry = new THREE.SphereGeometry(3, 32, 32);
    const saturnMaterial = new THREE.MeshStandardMaterial({ color: 0xF0E68C }); // Fallback color
    textureLoader.load('https://www.solarsystemscope.com/textures/download/2k_saturn.jpg', function(texture) {
        saturnMaterial.map = texture;
        saturnMaterial.needsUpdate = true;
        console.log('Saturn texture loaded.');
    }, undefined, function(err) {
        console.error('Error loading Saturn texture:', err);
    });
    const saturn = new THREE.Mesh(saturnGeometry, saturnMaterial);
    saturn.position.x = 45; 
    saturnOrbit.add(saturn); 
    
    const ringGeometry = new THREE.RingGeometry(3.5, 6, 64); // InnerR, OuterR, Segments
    // Using MeshBasicMaterial for rings for simplicity with transparency.
    // Base color set to white to let texture define color.
    const ringMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, transparent: true });
    textureLoader.load('https://www.solarsystemscope.com/textures/download/2k_saturn_ring_alpha.png', function(texture) {
        ringMaterial.map = texture; // Use texture for color
        ringMaterial.alphaMap = texture; // Use texture's alpha channel for transparency
        ringMaterial.needsUpdate = true;
        console.log('Saturn Rings texture loaded.');
    }, undefined, function(err) {
        console.error('Error loading Saturn Rings texture:', err);
    });
    const saturnRings = new THREE.Mesh(ringGeometry, ringMaterial);
    saturnRings.rotation.x = Math.PI / 2.5; // Tilt the rings
    saturnRings.position.x = 0; // Rings are centered on Saturn's mesh
    saturn.add(saturnRings); // Add rings as a child of Saturn's mesh
    planets.push({ mesh: saturn, orbit: saturnOrbit, speed: 0.001, rotationSpeed: 0.009, rings: saturnRings });

    // Uranus
    const uranusOrbit = new THREE.Object3D();
    scene.add(uranusOrbit);
    const uranusGeometry = new THREE.SphereGeometry(2, 32, 32);
    const uranusMaterial = new THREE.MeshStandardMaterial({ color: 0xAFEEEE }); // Fallback color
    textureLoader.load('https://www.solarsystemscope.com/textures/download/2k_uranus.jpg', function(texture) {
        uranusMaterial.map = texture;
        uranusMaterial.needsUpdate = true;
        console.log('Uranus texture loaded.');
    }, undefined, function(err) {
        console.error('Error loading Uranus texture:', err);
    });
    const uranus = new THREE.Mesh(uranusGeometry, uranusMaterial);
    uranus.position.x = 55;
    uranusOrbit.add(uranus);
    planets.push({ mesh: uranus, orbit: uranusOrbit, speed: 0.0007, rotationSpeed: 0.015 });

    // Neptune
    const neptuneOrbit = new THREE.Object3D();
    scene.add(neptuneOrbit);
    const neptuneGeometry = new THREE.SphereGeometry(1.9, 32, 32);
    const neptuneMaterial = new THREE.MeshStandardMaterial({ color: 0x3F51B5 }); // Fallback color
    textureLoader.load('https://www.solarsystemscope.com/textures/download/2k_neptune.jpg', function(texture) {
        neptuneMaterial.map = texture;
        neptuneMaterial.needsUpdate = true;
        console.log('Neptune texture loaded.');
    }, undefined, function(err) {
        console.error('Error loading Neptune texture:', err);
    });
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
            // Axial rotation (continues regardless of pause)
            p.mesh.rotation.y += p.rotationSpeed;

            // Cloud rotation (continues regardless of pause, if applicable)
            if (p.clouds && p.cloudSpeed) {
                p.clouds.rotation.y += p.cloudSpeed;
            }

            // Orbital movements (pauseable)
            if (!isOrbitPaused) {
                p.orbit.rotation.y += p.speed; // Planet's orbit around Sun

                if (p.moonOrbitPivot && p.moonOrbitSpeed) { // Check moonOrbitSpeed as well
                    p.moonOrbitPivot.rotation.y += p.moonOrbitSpeed; // Moon's orbit around the planet
                }
            }
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

    // Event listener for the pause button
    const pauseButton = document.getElementById('pauseOrbitButton');
    if (pauseButton) {
        pauseButton.addEventListener('click', () => {
            isOrbitPaused = !isOrbitPaused; // Toggle the pause state

            if (isOrbitPaused) {
                pauseButton.textContent = 'Resume Orbit';
            } else {
                pauseButton.textContent = 'Pause Orbit';
            }
            console.log('Orbit pause state:', isOrbitPaused); // For debugging
        });
    } else {
        console.error('Pause button not found in the DOM.');
    }
});
