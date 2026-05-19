/**
 * audioBlobToPcm16 — decode an audio Blob (MP3 / WAV / whatever the
 * browser supports via decodeAudioData) into 16 kHz mono PCM16 bytes
 * suitable for Simli's `sendAudioData()`.
 *
 * Key property: this runs at decode speed, NOT real-time playback
 * speed. A 4-second sentence decodes in ~50–100 ms on a modern
 * machine. That's how we send a whole TTS sentence to Simli's lipsync
 * model in one burst instead of streaming it at 1× speed.
 *
 * Resampling: linear interpolation. Audio sources are typically
 * 44.1 kHz or 48 kHz, and TTS output rarely has frequency content
 * above 8 kHz anyway — a low-pass would only matter for music or
 * high-fidelity speech. Skipping it saves complexity.
 *
 * Stereo handling: mixed to mono by averaging channels. Simli's
 * lipsync only cares about phoneme shape, so collapse is fine.
 */
export async function audioBlobToPcm16(
  blob: Blob,
  audioCtx: AudioContext,
  targetRate = 16000,
): Promise<Uint8Array> {
  const arrayBuf = await blob.arrayBuffer();
  // decodeAudioData expects a fresh ArrayBuffer it can detach. We
  // already have one from blob.arrayBuffer() so just pass it directly.
  // (Some Safari versions used to require a slice() copy here — modern
  // Chromium/Firefox/Safari handle it fine.)
  const audioBuffer = await audioCtx.decodeAudioData(arrayBuf);

  const srcLength = audioBuffer.length;
  const srcRate   = audioBuffer.sampleRate;
  const channels  = audioBuffer.numberOfChannels;

  // Mix to mono Float32 in one pass.
  const mono = new Float32Array(srcLength);
  for (let c = 0; c < channels; c++) {
    const ch = audioBuffer.getChannelData(c);
    for (let i = 0; i < srcLength; i++) {
      mono[i] += ch[i] / channels;
    }
  }

  // Resample to targetRate with linear interpolation.
  const ratio = srcRate / targetRate;
  const outLength = Math.floor(srcLength / ratio);
  const out = new Int16Array(outLength);

  for (let i = 0; i < outLength; i++) {
    const srcIdx = i * ratio;
    const idx = Math.floor(srcIdx);
    const frac = srcIdx - idx;
    const s0 = mono[idx] ?? 0;
    const s1 = mono[idx + 1] ?? s0;
    const sample = s0 + (s1 - s0) * frac;
    // Float32 [-1, 1] → Int16 [-32768, 32767]
    const clamped = sample > 1 ? 1 : sample < -1 ? -1 : sample;
    out[i] = Math.round(clamped * 32767);
  }

  // Return as a byte view of the Int16 buffer — that's the format
  // Simli's sendAudioData(audioData: Uint8Array) expects.
  return new Uint8Array(out.buffer);
}
