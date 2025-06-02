const canvas = document.getElementById('musicCanvas');
const ctx = canvas.getContext('2d');

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

let particlesArray = [];

// Mouse position object
const mouse = {
    x: null,
    y: null,
    radius: 100 // Interaction radius for mouse
};

window.addEventListener('mousemove', (event) => {
    mouse.x = event.clientX;
    mouse.y = event.clientY;
});
window.addEventListener('mouseout', () => { // Clear mouse position when it leaves canvas
    mouse.x = null;
    mouse.y = null;
});


// Simulated audio event flags
let bassBeat = false;
let highFrequencyActive = false;
let lastBeatTime = 0;
let beatInterval = 1000;
let lastHighFreqTime = 0;
let highFreqTriggerTime = 0;
const highFreqDuration = 200;
const highFreqCooldown = 500;


class Particle {
    constructor(x, y, size, color, weight) {
        this.x = x;
        this.y = y;
        this.originalSize = size;
        this.size = size;
        this.color = color;
        this.originalColor = color;
        this.weight = weight; // Now represents more of a base velocity component
        this.directionX = Math.random() * 2 - 1;
        this.directionY = Math.random() * 2 - 1;
        // this.defaultSpeedFactor = 1; // Will be handled differently now
    }

    draw() {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2, false);
        ctx.fillStyle = this.color;
        ctx.fill();
    }

    update() {
        // Boundary check
        if (this.x + this.size > canvas.width || this.x - this.size < 0) {
            this.directionX = -this.directionX;
        }
        if (this.y + this.size > canvas.height || this.y - this.size < 0) {
            this.directionY = -this.directionY;
        }

        // Mouse interaction
        if (mouse.x !== null && mouse.y !== null) {
            const dx = this.x - mouse.x;
            const dy = this.y - mouse.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            if (distance < mouse.radius + this.size) {
                const forceDirectionX = dx / distance;
                const forceDirectionY = dy / distance;
                const force = (mouse.radius - distance) / mouse.radius; // force stronger when closer
                // Apply a gentle push away from mouse
                this.x += forceDirectionX * force * 3; // Adjust multiplier for strength
                this.y += forceDirectionY * force * 3;
            }
        }
        
        let speedFactor = 1; // Base speed factor

        // Reaction to bass beat
        if (bassBeat) {
            this.size = this.originalSize * 1.8;
        } else {
            if (this.size > this.originalSize) {
                this.size -= 0.5; // Shrink effect
            } else {
                this.size = this.originalSize;
            }
        }

        // Reaction to high frequency
        if (highFrequencyActive) {
            this.color = 'hsl(' + (Math.random() * 60 + 200) + ', 70%, 60%)'; // Blue/purple hues
            speedFactor = 2.5; 
            this.x += (Math.random() - 0.5) * 4; // Jitter
            this.y += (Math.random() - 0.5) * 4;
        } else {
            this.color = this.originalColor;
        }

        this.x += this.directionX * this.weight * speedFactor;
        this.y += this.directionY * this.weight * speedFactor;
    }
}

function init() {
    particlesArray = [];
    const numberOfParticles = 120; // Slightly more particles
    for (let i = 0; i < numberOfParticles; i++) {
        const size = Math.random() * 6 + 3; // Smaller base size: 3 to 9
        const x = Math.random() * (canvas.width - size * 2) + size;
        const y = Math.random() * (canvas.height - size * 2) + size;
        const color = 'hsl(' + (180 + Math.random() * 100) + ', 60%, 60%)'; // Cool color palette (blues, cyans, purples)
        const weight = Math.random() * 0.4 + 0.3; // Slower base speed for more noticeable mouse interaction
        particlesArray.push(new Particle(x, y, size, color, weight));
    }
}

function simulateAudio() {
    const now = Date.now();
    if (now - lastBeatTime > beatInterval) {
        bassBeat = true;
        lastBeatTime = now;
        beatInterval = 700 + Math.random() * 600; // Beat interval 0.7s to 1.3s
    } else {
        bassBeat = false;
    }

    if (now > highFreqTriggerTime && !highFrequencyActive) {
        highFrequencyActive = true;
        lastHighFreqTime = now;
        highFreqTriggerTime = now + highFreqDuration + highFreqCooldown + Math.random() * 400;
    }
    
    if (highFrequencyActive && (now - lastHighFreqTime > highFreqDuration)) {
        highFrequencyActive = false;
    }
}

// Function to draw lines between nearby particles
function connectParticles() {
    let opacityValue = 0.5; // Base opacity for lines

    if (bassBeat) {
        opacityValue = 0.8; // Lines more visible on bass beat
    }
    if (highFrequencyActive) {
        // Potentially different line style for high frequency
    }


    for (let a = 0; a < particlesArray.length; a++) {
        for (let b = a + 1; b < particlesArray.length; b++) { // Start b from a + 1 to avoid duplicates and self-connection
            const dx = particlesArray[a].x - particlesArray[b].x;
            const dy = particlesArray[a].y - particlesArray[b].y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            const connectDistance = 100; // Max distance to connect particles

            if (distance < connectDistance) {
                // Calculate opacity based on distance - closer particles have more opaque lines
                const dynamicOpacity = Math.max(0.05, (1 - distance / connectDistance) * opacityValue);
                ctx.strokeStyle = `hsla(${particlesArray[a].hue}, 50%, 70%, ${dynamicOpacity})`; // Use particle's base hue for line
                // If particles don't have a hue property, use a default or derive from color
                // For now, let's use a common color for lines or the color of particle 'a'
                // We need to parse HSL from particle color or store hue separately if we want lines to match particle colors perfectly.
                // Let's try a generic color for now, or based on particle 'a's color.
                
                // Simplification: use particle 'a's current color for the line, but adjust alpha
                const colorA = particlesArray[a].color; // This is HSL string
                // A bit tricky to just change alpha of HSL string directly.
                // For simplicity, let's use a fixed line color that reacts to global effects.
                let lineColor = `rgba(180, 180, 220, ${dynamicOpacity})`; // Light blueish-grey lines
                if (bassBeat) {
                     lineColor = `rgba(255, 255, 255, ${dynamicOpacity * 1.5})`; // Brighter lines on beat
                }


                ctx.lineWidth = 1; // Line width
                ctx.beginPath();
                ctx.moveTo(particlesArray[a].x, particlesArray[a].y);
                ctx.lineTo(particlesArray[b].x, particlesArray[b].y);
                ctx.stroke();
            }
        }
    }
}


function animate() {
    simulateAudio();

    ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let i = 0; i < particlesArray.length; i++) {
        particlesArray[i].update();
        particlesArray[i].draw();
    }
    connectParticles(); // Call function to connect particles

    requestAnimationFrame(animate);
}

window.addEventListener('resize', () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    mouse.radius = Math.min(canvas.width, canvas.height) / 10; // Adjust mouse radius on resize
    highFreqTriggerTime = Date.now();
    init();
});

// Initial mouse radius calculation
mouse.radius = Math.min(canvas.width, canvas.height) / 10;

init();
animate();
