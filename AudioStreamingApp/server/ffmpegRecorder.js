// ffmpegRecorder.js - Fixed version
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

class FFmpegRecorder {
  constructor(outputPath, options = {}) {
    this.outputPath = outputPath;
    this.options = {
      sampleRate: options.sampleRate || 48000,
      channels: options.channels || 1,
      bitrate: options.bitrate || '64k',
      format: options.format || 'webm',
      codec: options.codec || 'libopus',
      ...options
    };
    
    this.ffmpegProcess = null;
    this.isRecording = false;
    this.startTime = null;
  }

  start() {
    if (this.isRecording) {
      throw new Error('Recording is already in progress');
    }

    return new Promise((resolve, reject) => {
      try {
        // Ensure output directory exists
        const outputDir = path.dirname(this.outputPath);
        if (!fs.existsSync(outputDir)) {
          fs.mkdirSync(outputDir, { recursive: true });
        }

        // Try different input methods based on platform/FFmpeg version
        const ffmpegArgs = [
          // Input settings - more explicit format specification
          '-f', 'f32le',                    // 32-bit float PCM input
          '-ar', this.options.sampleRate.toString(),
          '-ac', this.options.channels.toString(),
          '-i', '-',                        // Read from stdin (alternative to pipe:0)
          
          // Output settings
          '-c:a', this.options.codec,       // Audio codec
          '-b:a', this.options.bitrate,     // Audio bitrate
          '-f', this.options.format,        // Output format
          
          // Additional options for stability
          '-avoid_negative_ts', 'make_zero',
          '-fflags', '+genpts',
          '-loglevel', 'verbose',           // More detailed logging
          '-y',                             // Overwrite output file
          
          this.outputPath
        ];

        console.log('Starting FFmpeg with args:', ffmpegArgs);
        console.log('Full command:', 'ffmpeg', ffmpegArgs.join(' '));

        this.ffmpegProcess = spawn('ffmpeg', ffmpegArgs, {
          stdio: ['pipe', 'pipe', 'pipe']
        });

        this.ffmpegProcess.on('spawn', () => {
          console.log('FFmpeg process spawned successfully');
          this.isRecording = true;
          this.startTime = Date.now();
          resolve(this);
        });

        this.ffmpegProcess.on('error', (error) => {
          console.error('FFmpeg spawn error:', error);
          this.isRecording = false;
          reject(error);
        });

        this.ffmpegProcess.on('close', (code, signal) => {
          console.log(`FFmpeg process closed with code ${code}, signal ${signal}`);
          this.isRecording = false;
          
          if (code === 0) {
            const duration = this.startTime ? Date.now() - this.startTime : 0;
            console.log(`Recording completed successfully in ${duration}ms`);
            console.log(`Output file: ${this.outputPath}`);
            
            // Verify file was created and has content
            if (fs.existsSync(this.outputPath)) {
              const stats = fs.statSync(this.outputPath);
              console.log(`File size: ${stats.size} bytes`);
            }
          } else {
            console.error(`FFmpeg failed with code ${code}`);
          }
        });

        this.ffmpegProcess.stdout.on('data', (data) => {
          console.log('FFmpeg stdout:', data.toString().trim());
        });

        this.ffmpegProcess.stderr.on('data', (data) => {
          const output = data.toString().trim();
          if (output) {
            console.log('FFmpeg stderr:', output);
          }
        });

        this.ffmpegProcess.stdin.on('error', (error) => {
          if (error.code !== 'EPIPE') {
            console.error('FFmpeg stdin error:', error);
          }
        });

      } catch (error) {
        console.error('Failed to start FFmpeg recorder:', error);
        reject(error);
      }
    });
  }

  // Alternative start method for testing different input formats
  startWithAlternativeInput() {
    if (this.isRecording) {
      throw new Error('Recording is already in progress');
    }

    return new Promise((resolve, reject) => {
      try {
        const outputDir = path.dirname(this.outputPath);
        if (!fs.existsSync(outputDir)) {
          fs.mkdirSync(outputDir, { recursive: true });
        }

        // Alternative approach using explicit pipe format
        const ffmpegArgs = [
          '-f', 'f32le',
          '-ar', this.options.sampleRate.toString(),
          '-ac', this.options.channels.toString(),
          '-i', 'pipe:0',                   // Explicit pipe format
          '-c:a', this.options.codec,
          '-b:a', this.options.bitrate,
          '-f', this.options.format,
          '-avoid_negative_ts', 'make_zero',
          '-fflags', '+genpts',
          '-loglevel', 'debug',             // Maximum logging
          '-y',
          this.outputPath
        ];

        console.log('Alternative FFmpeg args:', ffmpegArgs);
        
        this.ffmpegProcess = spawn('ffmpeg', ffmpegArgs, {
          stdio: ['pipe', 'pipe', 'pipe']
        });

        // Same event handlers as before...
        this.setupEventHandlers(resolve, reject);

      } catch (error) {
        console.error('Failed to start FFmpeg recorder:', error);
        reject(error);
      }
    });
  }

  setupEventHandlers(resolve, reject) {
    this.ffmpegProcess.on('spawn', () => {
      console.log('FFmpeg process spawned successfully');
      this.isRecording = true;
      this.startTime = Date.now();
      resolve(this);
    });

    this.ffmpegProcess.on('error', (error) => {
      console.error('FFmpeg spawn error:', error);
      this.isRecording = false;
      reject(error);
    });

    this.ffmpegProcess.on('close', (code, signal) => {
      console.log(`FFmpeg process closed with code ${code}, signal ${signal}`);
      this.isRecording = false;
      
      if (code === 0) {
        const duration = this.startTime ? Date.now() - this.startTime : 0;
        console.log(`Recording completed successfully in ${duration}ms`);
        console.log(`Output file: ${this.outputPath}`);
        
        if (fs.existsSync(this.outputPath)) {
          const stats = fs.statSync(this.outputPath);
          console.log(`File size: ${stats.size} bytes`);
        }
      } else {
        console.error(`FFmpeg failed with code ${code}`);
      }
    });

    this.ffmpegProcess.stdout.on('data', (data) => {
      console.log('FFmpeg stdout:', data.toString().trim());
    });

    this.ffmpegProcess.stderr.on('data', (data) => {
      const output = data.toString().trim();
      if (output) {
        console.log('FFmpeg stderr:', output);
      }
    });

    this.ffmpegProcess.stdin.on('error', (error) => {
      if (error.code !== 'EPIPE') {
        console.error('FFmpeg stdin error:', error);
      }
    });
  }

  writeAudioData(buffer) {
    if (!this.isRecording || !this.ffmpegProcess || !this.ffmpegProcess.stdin.writable) {
      console.warn('Cannot write audio data - recorder not ready');
      return false;
    }

    try {
      // Add some debugging
      if (buffer && buffer.length > 0) {
        console.log(`Writing ${buffer.length} bytes to FFmpeg`);
      }
      return this.ffmpegProcess.stdin.write(buffer);
    } catch (error) {
      console.error('Error writing audio data:', error);
      return false;
    }
  }

  stop() {
    return new Promise((resolve) => {
      if (!this.isRecording || !this.ffmpegProcess) {
        console.log('Recorder already stopped or not started');
        resolve();
        return;
      }

      console.log('Stopping FFmpeg recorder...');

      const cleanup = () => {
        this.isRecording = false;
        this.ffmpegProcess = null;
        resolve();
      };

      this.ffmpegProcess.once('close', cleanup);

      try {
        if (this.ffmpegProcess.stdin && !this.ffmpegProcess.stdin.destroyed) {
          this.ffmpegProcess.stdin.end();
        }

        setTimeout(() => {
          if (this.ffmpegProcess && !this.ffmpegProcess.killed) {
            console.log('Force killing FFmpeg process');
            this.ffmpegProcess.kill('SIGKILL');
          }
        }, 5000);

      } catch (error) {
        console.error('Error stopping FFmpeg recorder:', error);
        cleanup();
      }
    });
  }

  getDuration() {
    return this.startTime ? Date.now() - this.startTime : 0;
  }

  isActive() {
    return this.isRecording;
  }
}

// Test function to verify FFmpeg installation and capabilities
function testFFmpeg() {
  return new Promise((resolve, reject) => {
    const testProcess = spawn('ffmpeg', ['-version'], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let output = '';
    testProcess.stdout.on('data', (data) => {
      output += data.toString();
    });

    testProcess.stderr.on('data', (data) => {
      output += data.toString();
    });

    testProcess.on('close', (code) => {
      if (code === 0) {
        console.log('FFmpeg test output:', output);
        resolve(output);
      } else {
        reject(new Error(`FFmpeg test failed with code ${code}`));
      }
    });

    testProcess.on('error', (error) => {
      reject(error);
    });
  });
}

function createFFmpegRecorder(outputPath, options = {}) {
  return new FFmpegRecorder(outputPath, options);
}

module.exports = { 
  FFmpegRecorder, 
  createFFmpegRecorder,
  testFFmpeg
};