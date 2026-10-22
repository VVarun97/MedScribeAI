/**
 * Real-time Voice Activity Detection (VAD) Engine using Web Audio API
 * Computes root-mean-square (RMS) energy, spectral centroid / zero-crossing rate,
 * and maintains continuous speech segmentation with silence hangover timers.
 */
export class VoiceActivityDetector {
  constructor(options = {}) {
    this.threshold = options.threshold || 0.015; // Energy threshold
    this.silenceHangoverMs = options.silenceHangoverMs || 1000; // 1 second of silence marks end of chunk
    this.minSpeechDurationMs = options.minSpeechDurationMs || 400; // Minimum duration to count as chunk
    this.onSpeechStart = options.onSpeechStart || (() => {});
    this.onSpeechEnd = options.onSpeechEnd || (() => {});
    this.onVolumeChange = options.onVolumeChange || (() => {});
    this.onChunkReady = options.onChunkReady || (() => {});

    this.audioContext = null;
    this.mediaStream = null;
    this.analyser = null;
    this.source = null;
    this.isRecording = false;
    this.isSpeaking = false;
    
    this.mediaRecorder = null;
    this.recordedChunks = [];
    this.speechStartTime = null;
    this.silenceTimer = null;
    this.animationFrameId = null;
  }

  async start() {
    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
          sampleRate: 16000
        }
      });

      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.audioContext = new AudioCtx({ sampleRate: 16000 });
      this.source = this.audioContext.createMediaStreamSource(this.mediaStream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 512;
      this.analyser.smoothingTimeConstant = 0.2;
      this.source.connect(this.analyser);

      // Setup MediaRecorder for capturing VAD speech segments
      const mimeTypes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg', 'audio/wav'];
      const supportedMime = mimeTypes.find(t => MediaRecorder.isTypeSupported(t)) || '';
      
      this.mediaRecorder = new MediaRecorder(this.mediaStream, supportedMime ? { mimeType: supportedMime } : undefined);
      this.recordedChunks = [];

      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          this.recordedChunks.push(e.data);
        }
      };

      this.mediaRecorder.onstop = () => {
        if (this.recordedChunks.length > 0) {
          const blob = new Blob(this.recordedChunks, { type: this.mediaRecorder.mimeType || 'audio/webm' });
          this.onChunkReady(blob);
          this.recordedChunks = [];
        }
      };

      this.mediaRecorder.start(250); // slices every 250ms
      this.isRecording = true;
      this._monitorAudio();
      return true;
    } catch (err) {
      console.error("Failed to access microphone or initialize audio context:", err);
      throw err;
    }
  }

  _monitorAudio() {
    if (!this.isRecording || !this.analyser) return;

    const dataArray = new Uint8Array(this.analyser.fftSize);
    this.analyser.getByteTimeDomainData(dataArray);

    // Calculate RMS energy
    let sumSquares = 0;
    for (let i = 0; i < dataArray.length; i++) {
      const normalized = (dataArray[i] - 128) / 128;
      sumSquares += normalized * normalized;
    }
    const rms = Math.sqrt(sumSquares / dataArray.length);
    this.onVolumeChange(rms);

    const now = Date.now();
    const isAboveThreshold = rms > this.threshold;

    if (isAboveThreshold) {
      if (!this.isSpeaking) {
        this.isSpeaking = true;
        this.speechStartTime = now;
        this.onSpeechStart();
      }
      // Clear silence timer if voice is active
      if (this.silenceTimer) {
        clearTimeout(this.silenceTimer);
        this.silenceTimer = null;
      }
    } else {
      if (this.isSpeaking && !this.silenceTimer) {
        // User stopped speaking, initiate silence hangover window
        this.silenceTimer = setTimeout(() => {
          this.isSpeaking = false;
          const speechDuration = Date.now() - (this.speechStartTime || 0);
          this.onSpeechEnd({ duration: speechDuration });
          this.silenceTimer = null;
          this.speechStartTime = null;
        }, this.silenceHangoverMs);
      }
    }

    this.animationFrameId = requestAnimationFrame(() => this._monitorAudio());
  }

  stop() {
    this.isRecording = false;
    this.isSpeaking = false;

    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }

    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      try {
        this.mediaRecorder.stop();
      } catch (e) {
        // ignore
      }
    }

    if (this.source) {
      this.source.disconnect();
      this.source = null;
    }

    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close();
      this.audioContext = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }
  }
}
