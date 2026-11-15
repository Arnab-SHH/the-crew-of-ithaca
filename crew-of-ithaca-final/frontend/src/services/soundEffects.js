/**
 * Web Audio API synthesized sound effects — no external MP3 files required.
 * All sounds are generated procedurally using oscillators and gain nodes.
 */

let ctx = null

function getCtx() {
  if (!ctx) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext
    if (AudioCtx) {
      ctx = new AudioCtx()
    }
  }
  if (ctx && ctx.state === 'suspended') {
    ctx.resume().catch(() => {})
  }
  return ctx
}

function playTone({ freq, type = 'sine', duration = 0.3, gain = 0.4, delay = 0, detune = 0 }) {
  const c = getCtx()
  if (!c) return
  try {
    const osc = c.createOscillator()
    const g = c.createGain()
    osc.connect(g)
    g.connect(c.destination)
    osc.type = type
    osc.frequency.setValueAtTime(freq, c.currentTime + delay)
    osc.detune.setValueAtTime(detune, c.currentTime + delay)
    g.gain.setValueAtTime(0, c.currentTime + delay)
    g.gain.linearRampToValueAtTime(gain, c.currentTime + delay + 0.02)
    g.gain.linearRampToValueAtTime(0, c.currentTime + delay + duration)
    osc.start(c.currentTime + delay)
    osc.stop(c.currentTime + delay + duration + 0.05)
  } catch (err) {
    console.warn('Audio playback error:', err)
  }
}

export function playJoinSound() {
  // Cheerful ascending arcade coin/chime
  const freqs = [261.63, 329.63, 392.00, 523.25, 659.25, 783.99]
  freqs.forEach((freq, i) => {
    playTone({ freq, type: 'triangle', duration: 0.18, gain: 0.35, delay: i * 0.07 })
  })
}

export function playWarningSound() {
  // Urgent two-tone pulsing siren
  for (let i = 0; i < 4; i++) {
    playTone({ freq: 880, type: 'sawtooth', duration: 0.14, gain: 0.3, delay: i * 0.28 })
    playTone({ freq: 659.25, type: 'sawtooth', duration: 0.14, gain: 0.3, delay: i * 0.28 + 0.14 })
  }
}

export function playDamageSound() {
  const c = getCtx()
  if (!c) return
  // Low cannon/explosion rumble + descending tone
  playTone({ freq: 80, type: 'sawtooth', duration: 0.6, gain: 0.5, delay: 0 })
  playTone({ freq: 110, type: 'square', duration: 0.45, gain: 0.35, delay: 0.04 })
  try {
    const osc = c.createOscillator()
    const g = c.createGain()
    osc.connect(g)
    g.connect(c.destination)
    osc.type = 'sawtooth'
    osc.frequency.setValueAtTime(440, c.currentTime + 0.05)
    osc.frequency.exponentialRampToValueAtTime(55, c.currentTime + 0.65)
    g.gain.setValueAtTime(0.4, c.currentTime + 0.05)
    g.gain.linearRampToValueAtTime(0, c.currentTime + 0.7)
    osc.start(c.currentTime + 0.05)
    osc.stop(c.currentTime + 0.75)
  } catch (err) {
    console.warn('Damage sound error:', err)
  }
}

export function playRecoverySound() {
  // Bright power-up chime
  const freqs = [523.25, 659.25, 783.99, 1046.50]
  freqs.forEach((freq, i) => {
    playTone({ freq, type: 'sine', duration: 0.22, gain: 0.35, delay: i * 0.09 })
  })
}

export function playGameOverSound() {
  // Dramatic sinking fanfare
  const freqs = [392.00, 349.23, 311.13, 277.18, 233.08]
  freqs.forEach((freq, i) => {
    playTone({ freq, type: 'sawtooth', duration: 0.45, gain: 0.4, delay: i * 0.28 })
  })
  playTone({ freq: 55, type: 'sine', duration: 1.5, gain: 0.5, delay: 1.4 })
}

// ---------------------------------------------------------------------------
// Voice playback
// ---------------------------------------------------------------------------

function speak(text) {
  if (!text || !window.speechSynthesis) return
  window.speechSynthesis.speak(new SpeechSynthesisUtterance(text))
}

/**
 * Captain Odysseus line sent by the backend (`captain_voice`).
 * Plays the ElevenLabs MP3 when present, otherwise the browser's own voice.
 */
export function playCaptainVoice({ audio, text }) {
  if (!audio) {
    speak(text)
    return
  }
  new Audio(`data:audio/mpeg;base64,${audio}`).play().catch(() => speak(text))
}

/** Push-to-talk clip from a crewmate (`crew_voice_message`), as a data: URL. */
export function playVoiceClip(audioData) {
  if (typeof audioData !== 'string' || !audioData.startsWith('data:audio')) return
  new Audio(audioData).play().catch((err) => console.warn('Voice clip playback error:', err))
}
