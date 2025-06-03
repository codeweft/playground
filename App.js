import React, { useEffect } from 'react';
import {
  Canvas,
  Circle,
  RadialGradient,
  Path,
  Skia,
  vec,
  interpolateColors,
  Group,
} from '@shopify/react-native-skia';
import {
  useSharedValue,
  useDerivedValue,
  withTiming,
  Easing,
  useFrameCallback,
  interpolate,
  Extrapolate,
} from 'react-native-reanimated';

// Constants
const CANVAS_WIDTH = 400;
const CANVAS_HEIGHT = 400;
const ORB_CENTER = vec(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
const ORB_RADIUS_MIN = 40;

// Helper for random variation
const randomFactor = (index) => {
  'worklet';
  // Simple pseudo-random factor based on index to ensure worklet compatibility
  return ((index * 137) % 100) / 100;
};

// Orb Component
const Orb = ({ isActive, soundLevel, clock }) => {
  const baseOrbRadius = useDerivedValue(() => ORB_RADIUS_MIN + soundLevel.value * 15);
  const orbPulseFactor = useDerivedValue(() => {
    const baseSpeed = isActive.value ? (220 - soundLevel.value * 150) : 700; // Slightly faster active pulse
    const amplitude = isActive.value ? (3 + soundLevel.value * 8) : 3.5; // Slightly larger active pulse
    return (Math.sin(clock.value / baseSpeed) + 1) * amplitude;
  });
  const currentOrbRadius = useDerivedValue(() => baseOrbRadius.value + orbPulseFactor.value);
  const orbColors = useDerivedValue(() => {
    const t = isActive.value ? soundLevel.value : 0;
    // Transition to brighter/more intense colors for active state
    return [
      interpolateColors(t, [0, 0.5, 1], [Skia.Color("rgba(120,120,255,0.4)"), Skia.Color("rgba(180,120,255,0.5)"), Skia.Color("rgba(255,120,180,0.6)")]),
      interpolateColors(t, [0, 0.5, 1], [Skia.Color("rgba(60,60,255,0.8)"), Skia.Color("rgba(120,60,255,0.9)"), Skia.Color("rgba(255,60,120,1)")]),
    ];
  }, [isActive, soundLevel]);

  return (
    <Circle cx={ORB_CENTER.x} cy={ORB_CENTER.y} r={currentOrbRadius}>
      <RadialGradient c={ORB_CENTER} r={currentOrbRadius} colors={orbColors} stops={[0.1, 1]} />
    </Circle>
  );
};

// Idle Waves Component
const NUM_IDLE_WAVES = 3;
const IDLE_WAVE_MAX_RADIUS = CANVAS_WIDTH * 0.55; // Slightly smaller max radius
const IDLE_WAVE_BASE_SPEED = 0.02; // Slower and more gentle
const IDLE_WAVE_BASE_AMPLITUDE = 4;
const IDLE_WAVE_BASE_FREQUENCY = 2.5;

const IdleWave = ({ index, clock, isActive }) => {
  const waveStartTime = useSharedValue(clock.value);
  const initialPhaseOffset = useSharedValue(Math.random() * 2 * Math.PI); // Random initial phase for displacement

  const currentWaveProgress = useDerivedValue(() => {
    if (isActive.value) {
      waveStartTime.value = clock.value; // Reset for next idle period
      return 0;
    }
    const timeSinceStart = clock.value - waveStartTime.value;
    const delay = index * 1200; // Increased delay for more separation
    if (timeSinceStart < delay) return 0;

    const progress = (timeSinceStart - delay) * IDLE_WAVE_BASE_SPEED;
    // Allow to go slightly beyond max radius to complete fade out, then reset by looping time
    if (progress > IDLE_WAVE_MAX_RADIUS + 50) { // +50 gives buffer for fade
        waveStartTime.value = clock.value - delay; // effectively resets progress for this wave
        initialPhaseOffset.value = Math.random() * 2 * Math.PI; // New random phase
        return 0;
    }
    return progress;
  });

  const path = useDerivedValue(() => {
    const p = Skia.Path.Make();
    const currentRadius = currentWaveProgress.value;
    if (currentRadius < ORB_RADIUS_MIN + 10 || currentRadius >= IDLE_WAVE_MAX_RADIUS ) return p;

    const points = 70; // Reduced points for potentially better perf on simple waves
    const waveSpecificFrequency = IDLE_WAVE_BASE_FREQUENCY + randomFactor(index) * 0.5;

    for (let i = 0; i < points; i++) {
      const angle = (i / points) * 2 * Math.PI;
      const displacement = Math.sin(angle * waveSpecificFrequency + clock.value / 500 + initialPhaseOffset.value) * IDLE_WAVE_BASE_AMPLITUDE * (1 - currentRadius / IDLE_WAVE_MAX_RADIUS);
      const r = currentRadius + displacement;
      const x = ORB_CENTER.x + r * Math.cos(angle);
      const y = ORB_CENTER.y + r * Math.sin(angle);
      if (i === 0) p.moveTo(x, y); else p.lineTo(x, y);
    }
    p.close();
    return p;
  }, [clock, isActive]);

  const opacity = useDerivedValue(() => {
    if (isActive.value || currentWaveProgress.value < ORB_RADIUS_MIN + 10 || currentWaveProgress.value >= IDLE_WAVE_MAX_RADIUS) return 0;
    const progressNormalized = currentWaveProgress.value / IDLE_WAVE_MAX_RADIUS;
    return Math.max(0, (1 - progressNormalized) * 0.35);
  });

  return <Path path={path} style="stroke" strokeWidth={1} color={Skia.Color("rgba(170, 170, 255, 0.8)")} opacity={opacity} />;
};

// Active Waves Component
const MAX_ACTIVE_WAVES = 7; // Max number of wave lines
const ACTIVE_WAVE_MAX_RADIUS = CANVAS_WIDTH * 0.75;
const ACTIVE_WAVE_BASE_SPEED = 0.04;

const ActiveWave = ({ index, clock, isActive, soundLevel }) => {
  const waveStartTime = useSharedValue(clock.value);
  // Store random factors for this wave instance - created once
  const randFreqFactor = useSharedValue(randomFactor(index + MAX_ACTIVE_WAVES) * 4 - 2); // Random factor between -2 and 2 for frequency
  const randAmpFactor = useSharedValue(0.7 + randomFactor(index) * 0.6); // Random factor between 0.7 and 1.3 for amplitude

  const isVisibleForCurrentSoundLevel = useDerivedValue(() => {
    // Number of waves increases more gradually
    const visibleWaveCount = Math.floor(interpolate(soundLevel.value, [0, 0.1, 0.5, 1], [0, 1, 3, MAX_ACTIVE_WAVES], Extrapolate.CLAMP));
    return index < visibleWaveCount;
  });

  const waveProgress = useDerivedValue(() => {
    if (!isActive.value || !isVisibleForCurrentSoundLevel.value) {
      waveStartTime.value = clock.value;
      return 0;
    }
    const timeSinceStart = clock.value - waveStartTime.value;
    const dynamicDelay = 800 / (soundLevel.value * MAX_ACTIVE_WAVES * 0.5 + 1) * index;

    if (timeSinceStart < dynamicDelay) return 0;

    const speed = ACTIVE_WAVE_BASE_SPEED + soundLevel.value * 0.06;
    const progress = (timeSinceStart - dynamicDelay) * speed;

    if (progress > ACTIVE_WAVE_MAX_RADIUS + 50) { // Loop with buffer
        waveStartTime.value = clock.value - dynamicDelay;
        return 0;
    }
    return progress;
  });

  const path = useDerivedValue(() => {
    const p = Skia.Path.Make();
    const currentRadius = waveProgress.value;

    if (!isActive.value || !isVisibleForCurrentSoundLevel.value || currentRadius < ORB_RADIUS_MIN + 15 || currentRadius >= ACTIVE_WAVE_MAX_RADIUS) {
      return p;
    }

    const points = 90;
    const baseAmplitude = soundLevel.value * 25 * randAmpFactor.value;
    const frequency = 2 + Math.floor(soundLevel.value * 6) + randFreqFactor.value;
    const displacementSpeed = clock.value / (180 - soundLevel.value * 120);

    for (let i = 0; i < points; i++) {
      const angle = (i / points) * 2 * Math.PI;
      const normalizedRadiusProgress = currentRadius / ACTIVE_WAVE_MAX_RADIUS;
      const amplitudeFactor = Math.sin(normalizedRadiusProgress * Math.PI); // Makes amplitude 0 at start and end of radius

      const displacement = Math.sin(angle * frequency + displacementSpeed) * baseAmplitude * amplitudeFactor;
      const r = currentRadius + displacement;
      const x = ORB_CENTER.x + r * Math.cos(angle);
      const y = ORB_CENTER.y + r * Math.sin(angle);
      if (i === 0) p.moveTo(x, y); else p.lineTo(x, y);
    }
    p.close();
    return p;
  }, [clock, isActive, soundLevel]);

  const waveColor = useDerivedValue(() => {
    return interpolateColors(
      soundLevel.value,
      [0, 0.3, 0.6, 1], // More color stops
      [Skia.Color("rgba(100, 200, 255, 0.7)"), Skia.Color("rgba(180, 255, 150, 0.8)"), Skia.Color("rgba(255, 180, 100, 0.9)"), Skia.Color("rgba(255, 80, 80, 1)")]
    );
  });

  const opacity = useDerivedValue(() => {
    if (!isActive.value || !isVisibleForCurrentSoundLevel.value || waveProgress.value < ORB_RADIUS_MIN + 15 || waveProgress.value >= ACTIVE_WAVE_MAX_RADIUS) return 0;
    const progressNormalized = waveProgress.value / ACTIVE_WAVE_MAX_RADIUS;
    return Math.max(0, (1 - progressNormalized) * (0.4 + soundLevel.value * 0.5));
  });

  const strokeWidth = useDerivedValue(() => 1 + soundLevel.value * 2.5);

  return <Path path={path} style="stroke" strokeWidth={strokeWidth} color={waveColor} opacity={opacity} />;
};


const App = () => {
  const soundLevel = useSharedValue(0);
  const isActive = useSharedValue(false);
  const clock = useSharedValue(0);

  useFrameCallback((frameInfo) => {
    clock.value = frameInfo.timeSinceFirstFrame;
  }, true);

  useEffect(() => {
    const soundLevelSlider = document.getElementById('soundLevel');
    const isActiveCheckbox = document.getElementById('isActive');
    const handleSliderChange = (event) => soundLevel.value = withTiming(parseFloat(event.target.value), { duration: 50 });
    const handleCheckboxChange = (event) => isActive.value = event.target.checked;
    if (soundLevelSlider) soundLevelSlider.addEventListener('input', handleSliderChange);
    if (isActiveCheckbox) isActiveCheckbox.addEventListener('change', handleCheckboxChange);
    if (soundLevelSlider) soundLevelSlider.value = soundLevel.value;
    if (isActiveCheckbox) isActiveCheckbox.checked = isActive.value;
    return () => {
      if (soundLevelSlider) soundLevelSlider.removeEventListener('input', handleSliderChange);
      if (isActiveCheckbox) isActiveCheckbox.removeEventListener('change', handleCheckboxChange);
    };
  }, [soundLevel, isActive]);

  const idleWaves = Array.from({ length: NUM_IDLE_WAVES }).map((_, i) => (
    <IdleWave key={`idle_${i}`} index={i} clock={clock} isActive={isActive} />
  ));

  const activeWaves = Array.from({ length: MAX_ACTIVE_WAVES }).map((_, i) => (
    <ActiveWave key={`active_${i}`} index={i} clock={clock} isActive={isActive} soundLevel={soundLevel} />
  ));

  const activeStateOpacity = useDerivedValue(() => isActive.value ? withTiming(1, {duration: 400, easing: Easing.out(Easing.ease)}) : withTiming(0, {duration: 400, easing: Easing.in(Easing.ease)}));
  const idleStateOpacity = useDerivedValue(() => !isActive.value ? withTiming(1, {duration: 400, easing: Easing.out(Easing.ease)}) : withTiming(0, {duration: 400, easing: Easing.in(Easing.ease)}));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100vh', backgroundColor: '#181820' }}>
      <div style={{ marginBottom: '20px', padding: '10px', background: '#282c34', borderRadius: '5px', boxShadow: '0 4px 8px rgba(0,0,0,0.2)' }}>
        <div style={{display: 'flex', alignItems: 'center', marginBottom: '5px'}}>
          <label htmlFor="soundLevel" style={{ color: '#abb2bf', marginRight: '10px', minWidth: '100px' }}>Sound Level: </label>
          <input type="range" id="soundLevel" min="0" max="1" step="0.01" defaultValue="0" style={{flexGrow: 1}} />
        </div>
        <div style={{display: 'flex', alignItems: 'center'}}>
          <label htmlFor="isActive" style={{ color: '#abb2bf', marginRight: '10px', minWidth: '100px' }}>Is Active: </label>
          <input type="checkbox" id="isActive" defaultChecked={false} />
        </div>
      </div>
      <Canvas style={{ width: CANVAS_WIDTH, height: CANVAS_HEIGHT, backgroundColor: '#000' }}>
        <Orb isActive={isActive} soundLevel={soundLevel} clock={clock} />
        <Group opacity={idleStateOpacity}>{idleWaves}</Group>
        <Group opacity={activeStateOpacity}>{activeWaves}</Group>
      </Canvas>
    </div>
  );
};

export default App;
