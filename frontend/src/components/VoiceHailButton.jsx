import React, { useRef, useState } from 'react'
import { socket } from '../services/socket.js'

const MAX_MS = 15000
const MIN_MS = 300

// Walkie-talkie: hold to record, release to send the clip to the crew.
export default function VoiceHailButton({ room, player }) {
  const [recording, setRecording] = useState(false)
  const [note, setNote] = useState('')
  const rec = useRef(null) // { recorder, stream, chunks, startedAt, timer }

  async function start(e) {
    e.preventDefault()
    if (rec.current) return
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setNote('Mic needs localhost or https')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      const state = { recorder, stream, chunks: [], startedAt: Date.now() }
      recorder.ondataavailable = (ev) => { if (ev.data.size) state.chunks.push(ev.data) }
      recorder.onstop = () => send(state)
      recorder.start()
      state.timer = setTimeout(stop, MAX_MS)
      rec.current = state
      setRecording(true)
      setNote('')
    } catch {
      setNote('Mic permission denied')
    }
  }

  function stop() {
    const state = rec.current
    if (!state) return
    rec.current = null
    clearTimeout(state.timer)
    if (state.recorder.state !== 'inactive') state.recorder.stop()
    setRecording(false)
  }

  function send(state) {
    state.stream.getTracks().forEach((t) => t.stop()) // release the mic
    if (Date.now() - state.startedAt < MIN_MS || !state.chunks.length) return
    const blob = new Blob(state.chunks, { type: state.recorder.mimeType || 'audio/webm' })
    const reader = new FileReader()
    reader.onloadend = () => {
      socket.emit('crew_voice_message', { room, player, audioData: reader.result })
      setNote('Hail sent')
      setTimeout(() => setNote(''), 1500)
    }
    reader.readAsDataURL(blob)
  }

  return (
    <button
      type="button"
      className={recording ? 'toggle active hail-button recording' : 'toggle hail-button'}
      onPointerDown={start}
      onPointerUp={stop}
      onPointerLeave={stop}
      onContextMenu={(e) => e.preventDefault()}
      title="Hold to talk to your crew"
    >
      {recording ? '🔴 Hailing… release to send' : note || '🎙️ Hold to Hail Crew'}
    </button>
  )
}
