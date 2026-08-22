/**
 * TestPanel — the voice surface.
 *
 * These pin the behaviour of the TTS queue, the mic/echo gate and the test
 * teardown path, all of which live inside the component (the queue is
 * module-private, so it is exercised through its observable effects: which
 * blob URL the shared <audio> element plays, what gets revoked, which
 * synthesize() signals get aborted, and what reaches streamDemoTurn).
 *
 * jsdom has no MediaRecorder / AudioContext / WebSocket-with-a-server and its
 * HTMLMediaElement.play() throws "not implemented", so those are stubbed in a
 * hoisted block — it has to run before TestPanel's module body, which reads
 * window.MediaRecorder at import time.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';

const H = vi.hoisted(() => {
  const recorders: any[] = [];
  const sockets: any[] = [];
  const audioContexts: any[] = [];
  const audioEls: HTMLAudioElement[] = [];
  const playedSrcs: string[] = [];
  const unlockPlays: string[] = [];
  const createdUrls: string[] = [];
  const revokedUrls: string[] = [];
  const micTracks: any[] = [];
  const blobLabels = new WeakMap<Blob, string>();
  const state = { playRejects: null as any, urlSeq: 0 };

  class FakeMediaRecorder {
    static isTypeSupported = () => true;
    state = 'inactive';
    mimeType: string;
    ondataavailable: any = null;
    onstop: any = null;
    onerror: any = null;
    onstart: any = null;
    constructor(public stream: any, opts?: any) {
      this.mimeType = opts?.mimeType || 'audio/webm';
      recorders.push(this);
    }
    start() {
      this.state = 'recording';
      this.onstart?.();
      // Big enough that the upload path isn't skipped as "too short".
      this.ondataavailable?.({ data: new Blob(['a'.repeat(4096)], { type: this.mimeType }) });
    }
    stop() {
      this.state = 'inactive';
      this.onstop?.();
    }
  }

  class FakeWebSocket {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;
    readyState = 1;
    binaryType = '';
    onmessage: any = null;
    onerror: any = null;
    onclose: any = null;
    sent: any[] = [];
    constructor(public url: string) { sockets.push(this); }
    send(d: any) { this.sent.push(d); }
    close() {
      if (this.readyState === 3) return;
      this.readyState = 3;
      this.onclose?.();
    }
    addEventListener(type: string, fn: any) { if (type === 'open') fn(); }
    removeEventListener() {}
  }

  class FakeAudioContext {
    state = 'running';
    sampleRate: number;
    destination = {};
    constructor(opts?: any) {
      this.sampleRate = opts?.sampleRate ?? 48000;
      audioContexts.push(this);
    }
    createMediaElementSource() { return { connect: () => {} }; }
    createMediaStreamSource() { return { connect: () => {}, disconnect: () => {} }; }
    createMediaStreamDestination() { return { stream: { getTracks: () => [] } }; }
    createScriptProcessor() {
      return { connect: () => {}, disconnect: () => {}, onaudioprocess: null };
    }
    resume() { this.state = 'running'; return Promise.resolve(); }
    close() { this.state = 'closed'; return Promise.resolve(); }
  }

  (globalThis as any).MediaRecorder = FakeMediaRecorder;
  (globalThis as any).AudioContext = FakeAudioContext;
  (globalThis as any).webkitAudioContext = FakeAudioContext;

  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getUserMedia: vi.fn(async () => {
        const track = { kind: 'audio', stop: vi.fn() };
        micTracks.push(track);
        return { getTracks: () => [track] } as any;
      }),
    },
  });

  URL.createObjectURL = ((blob: Blob) => {
    const url = `blob:${blobLabels.get(blob) ?? 'anon'}#${++state.urlSeq}`;
    createdUrls.push(url);
    return url;
  }) as any;
  URL.revokeObjectURL = ((url: string) => { revokedUrls.push(url); }) as any;

  // jsdom implements neither of these.
  Element.prototype.scrollTo = function () {};

  Object.defineProperty(HTMLMediaElement.prototype, 'readyState', {
    configurable: true,
    get: () => 4,   // skip the canplaythrough wait
  });
  HTMLMediaElement.prototype.load = function () {};
  HTMLMediaElement.prototype.pause = function () {};
  HTMLMediaElement.prototype.play = function (this: HTMLAudioElement) {
    const src = this.getAttribute('src') || '';
    // The silent data: URI is the autoplay unlock, not a TTS slot.
    (src.startsWith('data:') ? unlockPlays : playedSrcs).push(src);
    return state.playRejects ? Promise.reject(state.playRejects) : Promise.resolve();
  } as any;

  const RealAudio = window.Audio;
  (window as any).Audio = function (src?: string) {
    const el = new RealAudio(src);
    audioEls.push(el);
    return el;
  };

  return {
    FakeWebSocket,
    unlockPlays,
    recorders, sockets, audioContexts, audioEls, playedSrcs,
    createdUrls, revokedUrls, micTracks, blobLabels, state,
  };
});

const toasts: Array<{ msg: string; kind: string }> = [];
vi.mock('../../src/context/AppContext', () => ({
  useApp: () => ({
    addToast: (msg: string, kind = 'success') => { toasts.push({ msg, kind }); },
  }),
}));
vi.mock('posthog-js', () => ({ default: { capture: vi.fn() } }));

const startDemo = vi.fn();
const streamDemoTurn = vi.fn();
const prefetchDemoRag = vi.fn();
vi.mock('../../src/api/demo', () => ({
  startDemo:      (...a: any[]) => startDemo(...a),
  streamDemoTurn: (...a: any[]) => streamDemoTurn(...a),
  prefetchDemoRag: (...a: any[]) => prefetchDemoRag(...a),
}));

const synthesize = vi.fn();
vi.mock('../../src/api/tts', () => ({ synthesize: (...a: any[]) => synthesize(...a) }));

const uploadRecording = vi.fn();
vi.mock('../../src/api/recordings', () => ({ uploadRecording: (...a: any[]) => uploadRecording(...a) }));

vi.mock('../../src/api/stt', () => ({
  streamUrl: (lang = 'multi') => `ws://test/v1/stt/stream?language=${lang}`,
}));

import TestPanel from '../../src/components/agent/TestPanel';

// ── helpers ──────────────────────────────────────────────────────────────────

interface TurnCall {
  agentId: string;
  sessionId: string;
  utterance: string;
  cb: any;
  signal?: AbortSignal;
  finish: () => void;
}
let turns: TurnCall[] = [];
interface SynthCall { text: string; signal?: AbortSignal }
let synths: SynthCall[] = [];

/** Flush pending microtasks + effects. */
async function flush(times = 6) {
  for (let i = 0; i < times; i++) {
    // eslint-disable-next-line no-await-in-loop
    await act(async () => { await Promise.resolve(); });
  }
}

function labelledBlob(text: string): Blob {
  const b = new Blob([text]);
  H.blobLabels.set(b, text);
  return b;
}

/** The single module-level <audio> element the queue drives. */
function ttsAudio(): HTMLAudioElement {
  return H.audioEls[H.audioEls.length - 1];
}

/** Finish the slot currently playing. */
async function endPlayback() {
  const el = ttsAudio();
  await act(async () => { (el as any).onended?.(new Event('ended')); });
  await flush(2);
}

async function typeAndSend(text: string) {
  const input = screen.getByPlaceholderText('Type a question…');
  await act(async () => {
    fireEvent.change(input, { target: { value: text } });
    fireEvent.keyDown(input, { key: 'Enter' });
  });
  await flush();
}

async function startTest() {
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Start test' })); });
  await flush();
}

/** Push an STT event into the session WebSocket the way the backend would. */
async function sttEvent(payload: Record<string, unknown>) {
  const ws = H.sockets[H.sockets.length - 1];
  await act(async () => { ws.onmessage({ data: JSON.stringify(payload) }); });
  await flush();
}

async function speak(transcript: string) {
  await sttEvent({ type: 'final', transcript });
  await sttEvent({ type: 'speech_final' });
}

function renderPanel(props: Partial<React.ComponentProps<typeof TestPanel>> = {}) {
  return render(<TestPanel agentId="a1" {...props} />);
}

beforeEach(() => {
  // msw's server.listen() replaces globalThis.WebSocket with an interceptor in
  // a beforeAll hook, and that proxy swallows the handlers the component
  // attaches — so claim the global back here, after msw has had its turn.
  Object.defineProperty(globalThis, 'WebSocket', {
    configurable: true, writable: true, value: H.FakeWebSocket,
  });
  (navigator.mediaDevices.getUserMedia as any).mockClear();
  turns = [];
  synths = [];
  toasts.length = 0;
  H.recorders.length = 0;
  H.sockets.length = 0;
  H.audioContexts.length = 0;
  H.playedSrcs.length = 0;
  H.unlockPlays.length = 0;
  H.createdUrls.length = 0;
  H.revokedUrls.length = 0;
  H.micTracks.length = 0;
  H.state.playRejects = null;
  // The <audio> element is module-global and outlives each test.
  if (H.audioEls.length) {
    const el = ttsAudio();
    el.removeAttribute('src');
    (el as any).onended = null;
    (el as any).onerror = null;
  }

  startDemo.mockReset().mockImplementation(async () => ({ demo_session_id: 's1', agent_id: 'a1' }));
  prefetchDemoRag.mockReset();
  uploadRecording.mockReset().mockResolvedValue({ id: 'r1' });
  synthesize.mockReset().mockImplementation(async ({ text, signal }: any) => {
    synths.push({ text, signal });
    return labelledBlob(text);
  });
  streamDemoTurn.mockReset().mockImplementation(
    (agentId: string, sessionId: string, utterance: string, cb: any, signal?: AbortSignal) =>
      new Promise<void>((resolve) => {
        turns.push({ agentId, sessionId, utterance, cb, signal, finish: resolve });
      }),
  );
});

// ── TTS queue ────────────────────────────────────────────────────────────────

describe('TestPanel — TTS queue', () => {
  it('plays sentences in enqueue order even when synthesis resolves out of order', async () => {
    const pending: Record<string, (b: Blob) => void> = {};
    synthesize.mockImplementation(({ text, signal }: any) =>
      new Promise<Blob>((resolve) => {
        synths.push({ text, signal });
        pending[text] = () => resolve(labelledBlob(text));
      }),
    );

    renderPanel();
    await flush();
    await typeAndSend('tell me about the pricing plans');

    const cb = turns[0].cb;
    await act(async () => {
      cb.onSentence('first.', 'first.');
      cb.onSentence('second.', 'first. second.');
    });

    // Second sentence's synthesis lands first — it must still wait its turn.
    await act(async () => { pending['second.'](); });
    await flush();
    expect(H.playedSrcs).toHaveLength(0);

    await act(async () => { pending['first.'](); });
    await flush();
    expect(H.playedSrcs).toHaveLength(1);
    expect(H.playedSrcs[0]).toContain('blob:first.');

    await endPlayback();
    expect(H.playedSrcs).toHaveLength(2);
    expect(H.playedSrcs[1]).toContain('blob:second.');
  });

  it('a new turn cancels the previous turn: aborts its synthesis, revokes its URLs and detaches the source', async () => {
    renderPanel();
    await flush();
    await typeAndSend('tell me about the pricing plans');

    await act(async () => {
      turns[0].cb.onSentence('one.', 'one.');
      turns[0].cb.onSentence('two.', 'one. two.');
    });
    await flush();
    expect(H.playedSrcs).toHaveLength(1);          // "one." is playing
    const turnOneSignal = synths[0].signal!;
    expect(turnOneSignal.aborted).toBe(false);
    await act(async () => { turns[0].finish(); });
    await flush();
    const turnOneUrls = [...H.createdUrls];
    expect(turnOneUrls).toHaveLength(2);

    // Second turn while the first is still speaking.
    await typeAndSend('and what about annual billing');

    expect(turnOneSignal.aborted).toBe(true);
    // Every URL the first turn created is revoked...
    for (const url of turnOneUrls) expect(H.revokedUrls).toContain(url);
    // ...and the superseded queue never plays its remaining slot.
    await flush();
    expect(H.playedSrcs.filter(s => s.includes('blob:two.'))).toEqual([]);
  });

  it('surfaces a toast when playback is rejected instead of only logging it', async () => {
    H.state.playRejects = Object.assign(new Error('blocked'), { name: 'NotAllowedError' });
    renderPanel();
    await flush();
    await typeAndSend('tell me about the pricing plans');
    await act(async () => { turns[0].cb.onSentence('hello.', 'hello.'); });
    await flush();

    expect(toasts.some(t => /Playback failed/i.test(t.msg) && t.kind === 'error')).toBe(true);
  });

  it('turning voice off mid-reply stops the queue instead of advancing to the next sentence', async () => {
    renderPanel();
    await flush();
    await typeAndSend('tell me about the pricing plans');
    await act(async () => {
      turns[0].cb.onSentence('one.', 'one.');
      turns[0].cb.onSentence('two.', 'one. two.');
    });
    await flush();
    expect(H.playedSrcs).toHaveLength(1);
    const signal = synths[0].signal!;

    await act(async () => { fireEvent.click(screen.getByText('Voice on')); });
    await flush();

    expect(signal.aborted).toBe(true);
    expect(ttsAudio().hasAttribute('src')).toBe(false);
    // "two." is already synthesized and would previously have played on the
    // error event that `src = ''` fired.
    await flush();
    expect(H.playedSrcs).toHaveLength(1);
  });

  it('plays a filler from turn 2 onward, and never on turn 1', async () => {
    renderPanel();
    await flush();

    await typeAndSend('tell me about the pricing plans');
    expect(synths.map(s => s.text)).toEqual([]);          // nothing synthesized yet
    await act(async () => { turns[0].cb.onSentence('sure.', 'sure.'); turns[0].finish(); });
    await flush();
    expect(synths.map(s => s.text)).toEqual(['sure.']);   // no filler on turn 1

    await typeAndSend('and what about annual billing discounts');
    // Turn 2 fires a filler before the LLM answers.
    expect(synths.length).toBeGreaterThan(1);
    const filler = synths[1].text;
    expect(filler).not.toBe('sure.');
    expect(filler.length).toBeGreaterThan(0);
  });
});

// ── mic gate / barge-in ──────────────────────────────────────────────────────

describe('TestPanel — mic gate while the agent is speaking', () => {
  it('unlocks the shared audio element inside the Start-test click', async () => {
    renderPanel();
    await flush();
    expect(H.unlockPlays).toHaveLength(0);
    await startTest();
    // Safari/iOS reject a play() made two awaits deep unless the element has
    // already been played from a gesture.
    expect(H.unlockPlays).toHaveLength(1);
    expect(H.unlockPlays[0].startsWith('data:audio/wav')).toBe(true);
  });

  it('shows the speaking state as soon as the first slot is enqueued', async () => {
    renderPanel();
    await flush();
    await startTest();
    await speak('tell me about the pricing plans');
    await act(async () => { turns[0].cb.onSentence('we charge ten dollars.', 'we charge ten dollars.'); });
    await flush();

    expect(screen.getByText(/Agent is speaking/)).toBeInTheDocument();
  });

  it('drops a transcript that is an echo of the agent\'s own speech', async () => {
    renderPanel();
    await flush();
    await startTest();
    await speak('tell me about the pricing plans');
    await act(async () => {
      turns[0].cb.onSentence('our pricing starts at ten dollars a month.', 'our pricing starts at ten dollars a month.');
    });
    await flush();
    expect(H.playedSrcs).toHaveLength(1);

    await speak('our pricing starts at ten dollars');

    expect(streamDemoTurn).toHaveBeenCalledTimes(1);          // no self-answer
    expect(ttsAudio().hasAttribute('src')).toBe(true);        // still speaking
    expect(screen.queryByText('our pricing starts at ten dollars')).toBeNull();
  });

  it('treats a genuine interruption as barge-in: cancels playback and takes the turn', async () => {
    renderPanel();
    await flush();
    await startTest();
    await speak('tell me about the pricing plans');
    await act(async () => {
      turns[0].cb.onSentence('our pricing starts at ten dollars a month.', 'our pricing starts at ten dollars a month.');
    });
    await flush();

    await speak('hold on I asked about delivery times');

    expect(streamDemoTurn).toHaveBeenCalledTimes(2);
    expect(turns[1].utterance).toBe('hold on I asked about delivery times');
    // The interrupted sentence is cancelled: its blob URL is revoked mid-play
    // and its synthesis signal aborted.
    expect(H.revokedUrls).toContain(H.playedSrcs[0]);
    expect(synths[0].signal!.aborted).toBe(true);
  });
});

// ── stale-closure handling in the STT socket handlers ────────────────────────

describe('TestPanel — session STT socket handlers stay current', () => {
  it('reuses the demo session across spoken turns instead of opening a new one each time', async () => {
    // The eager session resolves only after startTest, so the render that
    // attached the socket handlers saw sessionId === null.
    let releaseSession!: () => void;
    startDemo.mockImplementation(() => new Promise((resolve) => {
      releaseSession = () => resolve({ demo_session_id: 's1', agent_id: 'a1' } as any);
    }));

    renderPanel();
    await flush();
    await startTest();
    await act(async () => { releaseSession(); });
    await flush();

    await speak('tell me about the pricing plans');
    await act(async () => { turns[0].cb.onSentence('sure.', 'sure.'); turns[0].finish(); });
    await flush();
    await endPlayback();

    await speak('and what about annual billing discounts');

    expect(startDemo).toHaveBeenCalledTimes(1);
    expect(turns).toHaveLength(2);
    expect(turns[1].sessionId).toBe('s1');
  });

  it('ignores a second transcript while a turn is already in flight', async () => {
    renderPanel();
    await flush();
    await startTest();
    await speak('tell me about the pricing plans');
    await speak('tell me about the pricing plans again');

    expect(streamDemoTurn).toHaveBeenCalledTimes(1);
  });
});

// ── start / stop / teardown ──────────────────────────────────────────────────

describe('TestPanel — session lifecycle', () => {
  it('double-clicking Start test builds only one pipeline', async () => {
    let releaseMic!: (s: any) => void;
    (navigator.mediaDevices.getUserMedia as any).mockImplementationOnce(
      () => new Promise((resolve) => {
        releaseMic = () => {
          const track = { kind: 'audio', stop: vi.fn() };
          H.micTracks.push(track);
          resolve({ getTracks: () => [track] });
        };
      }),
    );

    renderPanel();
    await flush();
    const button = screen.getByRole('button', { name: 'Start test' });
    await act(async () => { fireEvent.click(button); });
    // Second click lands while getUserMedia is still pending. The control is now
    // the icon button in the composer, so the pending state shows as aria-busy
    // rather than a "Starting…" label.
    expect(button).toHaveAttribute('aria-busy', 'true');
    await act(async () => { fireEvent.click(button); });
    await act(async () => { releaseMic(null); });
    await flush();

    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledTimes(1);
    expect(H.recorders).toHaveLength(1);
    expect(H.sockets).toHaveLength(1);
  });

  it('captures the mic at 16 kHz rather than decimating by index', async () => {
    renderPanel();
    await flush();
    await startTest();
    expect(H.audioContexts.some(c => c.sampleRate === 16000)).toBe(true);
  });

  it('unmounting mid-test releases the mic and still uploads the recording', async () => {
    const { unmount } = renderPanel();
    await flush();
    await startTest();
    expect(H.micTracks).toHaveLength(1);

    await act(async () => { unmount(); });
    await flush();

    expect(H.micTracks[0].stop).toHaveBeenCalled();
    expect(uploadRecording).toHaveBeenCalledTimes(1);
    expect(H.sockets[0].readyState).toBe(3);
  });

  it('closing the tab (pagehide) tears the session down too', async () => {
    renderPanel();
    await flush();
    await startTest();

    await act(async () => { window.dispatchEvent(new Event('pagehide')); });
    await flush();

    expect(H.micTracks[0].stop).toHaveBeenCalled();
    expect(uploadRecording).toHaveBeenCalledTimes(1);
  });

  it('switching agents stops the active test', async () => {
    const { rerender } = render(<TestPanel agentId="a1" />);
    await flush();
    await startTest();
    expect(screen.getByRole('button', { name: 'Stop test' })).toBeInTheDocument();

    await act(async () => { rerender(<TestPanel agentId="a2" />); });
    await flush();

    expect(H.micTracks[0].stop).toHaveBeenCalled();
    expect(H.sockets[0].readyState).toBe(3);
    expect(uploadRecording).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Start test' })).toBeInTheDocument();
    // The recording belongs to the agent we left, not the one we switched to.
    expect(uploadRecording.mock.calls[0][0].agentId).toBe('a1');
  });

  it('stopping the test does not reconnect the STT socket', async () => {
    renderPanel();
    await flush();
    await startTest();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Stop test' })); });
    await flush();

    expect(H.sockets).toHaveLength(1);
    expect(H.sockets[0].readyState).toBe(3);
  });
});
