import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useState } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { server } from '../mocks/server';
import { API_BASE } from '../mocks/fixtures';
import VoiceIndicator from '../../src/components/voice/VoiceIndicator';
import { resetVoiceRegistry, useVoiceTarget } from '../../src/voice/registry/store';
import { FLOWS_NAME, FLOWS_SAVE } from '../../src/voice/registry/flowsTargets';
import { GLOBAL_SEARCH } from '../../src/voice/registry/navTargets';
import { toastStore } from '../../src/hooks/useToast';
import type { VoiceTarget } from '../../src/voice/types';

/**
 * Speaking a command must move the app. This drives the real pipeline —
 * MediaRecorder to STT to parse to validate to execute to react-router — and
 * asserts on the rendered route, not on any intermediate value.
 *
 * Only the two things a test cannot have are faked: the microphone, and the
 * network. The browser media APIs are stubbed in vi.hoisted because the hook
 * reads window.MediaRecorder at module-load time to decide whether voice is
 * supported at all, so the stub has to exist before the import is evaluated —
 * the same ordering constraint documented in testpanel-voice.test.tsx. STT is
 * mocked over MSW rather than by module-mocking src/api/stt, so the real fetch,
 * FormData and response parsing are all exercised.
 */
vi.hoisted(() => {
  class FakeMediaRecorder {
    static isTypeSupported() { return true; }
    state = 'inactive';
    ondataavailable: ((e: { data: Blob }) => void) | null = null;
    onstop: (() => void) | null = null;
    onerror: ((e: unknown) => void) | null = null;
    constructor(public stream: unknown, public options?: unknown) {}
    start() { this.state = 'recording'; }
    stop() {
      this.state = 'inactive';
      // Large enough that the hook does not discard it as an empty utterance.
      this.ondataavailable?.({ data: new Blob(['x'.repeat(2048)], { type: 'audio/webm' }) });
      this.onstop?.();
    }
  }
  (globalThis as unknown as { MediaRecorder: unknown }).MediaRecorder = FakeMediaRecorder;

  const stopped: string[] = [];
  (globalThis as unknown as { __voiceStoppedTracks: string[] }).__voiceStoppedTracks = stopped;
  Object.defineProperty(globalThis.navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getUserMedia: async () => ({
        getTracks: () => [{ stop: () => { stopped.push('stopped'); }, kind: 'audio' }],
      }),
    },
  });
});

function Probe() {
  const { pathname } = useLocation();
  return <span>route:{pathname}</span>;
}

function renderApp(initial = '/healthcare', extra: React.ReactNode = null) {
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <Probe />
      <Routes>
        <Route path="/healthcare"     element={<h1>Healthcare</h1>} />
        <Route path="/analytics/:tab" element={<h1>Analytics</h1>} />
        <Route path="/connects"       element={<h1>Connectors</h1>} />
        <Route path="/flows"          element={<h1>Flows</h1>} />
      </Routes>
      {extra}
      <VoiceIndicator />
    </MemoryRouter>,
  );
}

/**
 * A page button that has put itself on the voice registry, exactly as the Flows
 * toolbar does. Registering through the real useVoiceTarget rather than calling
 * registerTarget by hand keeps the ref lifecycle — and its remount guard —
 * inside what these tests cover.
 */
function VoiceButton({ target, onClick }: { target: VoiceTarget; onClick: () => void }) {
  const ref = useVoiceTarget<HTMLButtonElement>(target);
  return <button ref={ref} onClick={onClick}>{target.label}</button>;
}

/**
 * A React-CONTROLLED field on the voice registry, like Flows' workflow name.
 *
 * The `state:` span is the point of this helper, not decoration. Reading
 * input.value cannot tell a working type from a broken one: if the executor
 * writes el.value directly, react-dom's tracker swallows the change event so
 * state never updates — but with no state change there is also no re-render,
 * and React therefore never overwrites the DOM. The field still reads
 * "onboarding" while React believes it is empty.
 *
 * That gap is the whole bug. saveWorkflow (flows/index.tsx:463) sends
 * `name: flowName` — React state, not the DOM — so the broken version would put
 * the words in the field, announce "Typed onboarding into Workflow name", and
 * then persist the OLD name: silent data loss with visual confirmation of
 * success. Rendering state separately is what makes the two tellable apart.
 */
function VoiceInput({ target }: { target: VoiceTarget }) {
  const ref = useVoiceTarget<HTMLInputElement>(target);
  const [value, setValue] = useState('');
  return (
    <>
      <input
        ref={ref}
        value={value}
        onChange={e => setValue(e.target.value)}
        aria-label={target.label}
      />
      {/* One text node, so getByText matches the whole string. */}
      <span>{`state:${value}`}</span>
    </>
  );
}

const micButton = () => screen.getByRole('button', { name: /hold to speak/i });

interface SttOverrides {
  confidence?: number | null;
  drop_reason?: string | null;
}

/** Hold the mic, have STT return `text`, let go. */
async function speak(text: string, over: SttOverrides = {}) {
  server.use(
    http.post(`${API_BASE}/v1/stt/transcribe`, () => HttpResponse.json({
      transcript: text,
      detected_language: 'en',
      confidence: over.confidence ?? null,
      duration_ms: 120,
      drop_reason: over.drop_reason ?? null,
    })),
  );
  const btn = micButton();
  // Two acts: press() awaits getUserMedia, so the recorder does not exist until
  // that microtask has run. Releasing before it does is a real race the hook
  // handles, but this test is about the happy path.
  await act(async () => { fireEvent.pointerDown(btn); });
  await act(async () => { fireEvent.pointerUp(btn); });
}

const routeIs = (path: string) => screen.getByText(`route:${path}`);

/**
 * Have the parse endpoint answer the next utterance with `action`.
 *
 * Everything reaching this endpoint is by definition something parseLocal
 * could not handle, so these tests all speak a phrase its grammar misses.
 * Stubbing the response rather than the module keeps the real fetch, the real
 * body and the real response narrowing (src/api/voiceCommand.ts) in the path.
 */
function serverSays(action: unknown) {
  server.use(http.post(`${API_BASE}/v1/voice-command/parse`, () =>
    HttpResponse.json(action)));
}

/** The parse endpoint is down. */
function serverIsDown() {
  server.use(http.post(`${API_BASE}/v1/voice-command/parse`, () =>
    HttpResponse.json({ detail: 'Could not parse that just now.' }, { status: 503 })));
}

/** A phrase parseLocal.ts has no grammar for, so the hook must ask the server. */
const A_MISS = 'what happened to my refunds last quarter';

beforeEach(() => {
  resetVoiceRegistry();
  toastStore.reset();
  (globalThis as unknown as { __voiceStoppedTracks: string[] }).__voiceStoppedTracks.length = 0;
});

describe('voice navigation, end to end', () => {
  it('moves the app when told to go somewhere', async () => {
    renderApp('/healthcare');
    expect(routeIs('/healthcare')).toBeInTheDocument();

    await speak('go to Analytics');

    await waitFor(() => expect(routeIs('/analytics/summary')).toBeInTheDocument());
    expect(screen.getByRole('heading', { name: 'Analytics' })).toBeInTheDocument();
  });

  it('shows the user what it heard and what it did', async () => {
    renderApp('/healthcare');
    await speak('go to Analytics');

    await waitFor(() => expect(screen.getAllByText(/go to Analytics/).length).toBeGreaterThan(0));
    expect(screen.getAllByText('Opening Analytics').length).toBeGreaterThan(0);
  });

  it('maps the Integrations wording onto the Connectors page', async () => {
    renderApp('/healthcare');
    await speak('open the integrations tab');

    await waitFor(() => expect(routeIs('/connects')).toBeInTheDocument());
  });

  it('reaches a tab on another section', async () => {
    renderApp('/healthcare');
    await speak('show me sessions');

    await waitFor(() => expect(routeIs('/analytics/sessions')).toBeInTheDocument());
  });

  it('goes back through history rather than to a route', async () => {
    renderApp('/healthcare');
    await speak('go to Analytics');
    await waitFor(() => expect(routeIs('/analytics/summary')).toBeInTheDocument());

    await speak('go back');
    await waitFor(() => expect(routeIs('/healthcare')).toBeInTheDocument());
  });
});

describe('voice navigation refuses rather than guesses', () => {
  it('explains that there is no Settings page and stays put', async () => {
    renderApp('/healthcare');
    await speak('open settings');

    await waitFor(() => expect(screen.getAllByText(/no Settings page/i).length).toBeGreaterThan(0));
    expect(routeIs('/healthcare')).toBeInTheDocument();
  });

  it('asks which Agents was meant, naming both sections', async () => {
    renderApp('/healthcare');
    await speak('open agents');

    // Asserting the whole sentence on purpose. A looser /did you mean/i passed
    // happily while the question read "Do you mean Agents or Agents?".
    await waitFor(() => expect(
      screen.getAllByText('Do you mean Agents in Analytics, or Agents in Live Calls?').length,
    ).toBeGreaterThan(0));
    expect(routeIs('/healthcare')).toBeInTheDocument();
  });

  it('says so when the server cannot place it either, without navigating', async () => {
    renderApp('/healthcare');
    serverSays({ kind: 'reject', reason: 'unknown_target' });
    await speak(A_MISS);

    await waitFor(() => expect(
      screen.getAllByText(/could not find that on this screen/i).length,
    ).toBeGreaterThan(0));
    expect(routeIs('/healthcare')).toBeInTheDocument();
  });

  it('treats an empty transcript as unheard rather than parsing it', async () => {
    renderApp('/healthcare');
    await speak('');

    await waitFor(() => expect(screen.getAllByText(/did not catch that/i).length).toBeGreaterThan(0));
    expect(routeIs('/healthcare')).toBeInTheDocument();
  });
});

/**
 * Slice 4. Buttons register themselves at mount and voice presses them through
 * a real DOM click, so the element's own onClick fires exactly as it does for a
 * mouse. The destructive ones are recognised too, and answer with their limit
 * rather than pretending not to exist.
 */
describe('voice clicks buttons on the page', () => {
  it('presses a registered button through its real handler', async () => {
    const clicked = vi.fn();
    renderApp('/flows', <VoiceButton target={FLOWS_SAVE} onClick={clicked} />);

    await speak('click save');

    await waitFor(() => expect(clicked).toHaveBeenCalledTimes(1));
  });

  it('presses it from a bare name, with no verb at all', async () => {
    const clicked = vi.fn();
    renderApp('/flows', <VoiceButton target={FLOWS_SAVE} onClick={clicked} />);

    await speak('save');

    await waitFor(() => expect(clicked).toHaveBeenCalledTimes(1));
  });

  it('reaches it by alias', async () => {
    const clicked = vi.fn();
    renderApp('/flows', <VoiceButton target={FLOWS_SAVE} onClick={clicked} />);

    await speak('save workflow');

    await waitFor(() => expect(clicked).toHaveBeenCalledTimes(1));
  });

  it('says what it pressed', async () => {
    renderApp('/flows', <VoiceButton target={FLOWS_SAVE} onClick={() => {}} />);
    await speak('click save');

    await waitFor(() => expect(screen.getAllByText('Save').length).toBeGreaterThan(0));
  });

  it('does not press a button that is not on this screen', async () => {
    // Registered nowhere, so it is not in the snapshot. The registry is the
    // visibility filter — nothing off it can be actioned.
    const clicked = vi.fn();
    renderApp('/healthcare', <VoiceButton target={FLOWS_SAVE} onClick={clicked} />);

    // On /healthcare the target is out of scope even though it is mounted.
    serverSays({ kind: 'reject', reason: 'unknown_target' });
    await speak('click save');

    await waitFor(() => expect(
      screen.getAllByText(/could not find that on this screen/i).length,
    ).toBeGreaterThan(0));
    expect(clicked).not.toHaveBeenCalled();
  });

  it('does not press anything when the button has unmounted mid-utterance', async () => {
    const clicked = vi.fn();
    const { rerender } = render(
      <MemoryRouter initialEntries={['/flows']}>
        <Probe />
        <VoiceButton target={FLOWS_SAVE} onClick={clicked} />
        <VoiceIndicator />
      </MemoryRouter>,
    );
    rerender(
      <MemoryRouter initialEntries={['/flows']}>
        <Probe />
        <VoiceIndicator />
      </MemoryRouter>,
    );

    serverSays({ kind: 'reject', reason: 'unknown_target' });
    await speak('click save');

    expect(clicked).not.toHaveBeenCalled();
  });
});

describe('voice refuses to destroy things, out loud', () => {
  it('names the limit instead of claiming the button does not exist', async () => {
    /**
     * The button is right there on the page. "I could not find that" would be
     * false, and would invite the user to simply say it again. This is the
     * COMING_SOON mechanism reused on a control that exists but is switched off.
     */
    renderApp('/flows');
    await speak('delete all flows');

    await waitFor(() => expect(
      screen.getAllByText(/cannot delete things by voice yet/i).length,
    ).toBeGreaterThan(0));
  });

  it('answers a clear the same way', async () => {
    renderApp('/flows');
    await speak('clear canvas');

    await waitFor(() => expect(
      screen.getAllByText(/cannot clear the canvas by voice yet/i).length,
    ).toBeGreaterThan(0));
  });

  it('never asks the server about a destructive phrase', async () => {
    /**
     * The property that keeps the safety path free of dead ends. If a
     * destructive phrase reached the endpoint it would come back
     * reject/unsupported — "I cannot do that yet" with no mention of the button
     * — and it would cost a tool call to say so.
     */
    let calls = 0;
    server.use(http.post(`${API_BASE}/v1/voice-command/parse`, () => {
      calls += 1;
      return HttpResponse.json({ kind: 'reject', reason: 'unsupported' });
    }));

    renderApp('/flows');
    await speak('delete all flows');

    await waitFor(() => expect(
      screen.getAllByText(/use the button/i).length,
    ).toBeGreaterThan(0));
    expect(calls).toBe(0);
  });

  it('does not offer destructive targets to the model when it does ask', async () => {
    // A phrase the local grammar misses still goes over the wire, but the
    // unavailable targets are filtered out of the payload: the only thing the
    // model could do with one is name it in a click the browser would refuse.
    let body: any;
    server.use(http.post(`${API_BASE}/v1/voice-command/parse`, async ({ request }) => {
      body = await request.json();
      return HttpResponse.json({ kind: 'reject', reason: 'unknown_target' });
    }));

    renderApp('/flows');
    await speak(A_MISS);

    await waitFor(() => expect(body).toBeDefined());
    const ids = body.targets.map((t: any) => t.id);
    expect(ids).not.toContain('flows.deleteWorkflow');
    expect(ids).not.toContain('flows.deleteNode');
    expect(ids).not.toContain('flows.clear');
    // The coming-soon nav entries are unavailable too, and go the same way.
    expect(ids).not.toContain('ui.settings');
  });
});

/**
 * What parseLocal could not answer goes to POST /v1/voice-command/parse, and
 * the answer comes back through exactly the same validation and execution the
 * local path uses. The point of these is that "the server said so" buys an
 * action nothing: it is checked here as if it had been guessed locally.
 */
describe('voice asks the server when the local grammar misses', () => {
  it('carries out an action the server resolved', async () => {
    renderApp('/healthcare');
    serverSays({ kind: 'navigate', targetId: 'nav.connectors' });
    await speak(A_MISS);

    await waitFor(() => expect(routeIs('/connects')).toBeInTheDocument());
  });

  it('sends the on-screen ids, and no paths, with the transcript', async () => {
    let body: any;
    server.use(http.post(`${API_BASE}/v1/voice-command/parse`, async ({ request }) => {
      body = await request.json();
      return HttpResponse.json({ kind: 'reject', reason: 'unknown_target' });
    }));

    renderApp('/healthcare');
    await speak(A_MISS);

    await waitFor(() => expect(body).toBeDefined());
    expect(body.transcript).toBe(A_MISS);
    expect(body.route).toBe('/healthcare');
    expect(body.targets.length).toBeGreaterThan(0);
    // The registry is full of paths; none of them leaves the browser.
    for (const t of body.targets) expect(t).not.toHaveProperty('path');
  });

  it('refuses a fabricated id even though the server sent it', async () => {
    /**
     * Defence in depth, and the reason the browser re-checks at all. The server
     * verifies ids against the list it was SENT; validate.ts verifies against
     * what is on screen when the answer lands. This test pretends the first
     * check failed — a compromised or buggy server — and asserts the second one
     * still holds. The id is deliberately plausible.
     */
    renderApp('/healthcare');
    serverSays({ kind: 'navigate', targetId: 'nav.billing' });
    await speak(A_MISS);

    await waitFor(() => expect(
      screen.getAllByText(/could not find that on this screen/i).length,
    ).toBeGreaterThan(0));
    expect(routeIs('/healthcare')).toBeInTheDocument();
  });

  it('cannot be talked into a route by the response', async () => {
    // Even if a response carries a path outright, execute.ts reads the
    // destination off the registered target and ignores anything else.
    renderApp('/healthcare');
    serverSays({ kind: 'navigate', targetId: 'nav.connectors', path: '/flows' });
    await speak(A_MISS);

    await waitFor(() => expect(routeIs('/connects')).toBeInTheDocument());
  });

  it('asks which one when the server comes back ambiguous', async () => {
    renderApp('/healthcare');
    serverSays({
      kind: 'clarify',
      reason: 'ambiguous',
      candidates: ['Agents in Analytics', 'Agents in Live Calls'],
    });
    await speak(A_MISS);

    await waitFor(() => expect(
      screen.getAllByText('Do you mean Agents in Analytics, or Agents in Live Calls?').length,
    ).toBeGreaterThan(0));
    expect(routeIs('/healthcare')).toBeInTheDocument();
  });

  it('says it cannot do that yet for an action this slice cannot execute', async () => {
    // What the endpoint returns for click / type / select / search / scroll
    // until execute.ts grows them in slices 4-6.
    renderApp('/healthcare');
    serverSays({ kind: 'reject', reason: 'unsupported' });
    await speak(A_MISS);

    await waitFor(() => expect(
      screen.getAllByText(/cannot do that yet/i).length,
    ).toBeGreaterThan(0));
  });

  it('stays put and asks again when the parse endpoint is down', async () => {
    renderApp('/healthcare');
    serverIsDown();
    await speak(A_MISS);

    await waitFor(() => expect(
      screen.getAllByText(/a different way/i).length,
    ).toBeGreaterThan(0));
    expect(routeIs('/healthcare')).toBeInTheDocument();
  });

  it('never asks the server about something it resolved locally', async () => {
    // The fast path must stay free. A network call for "go to Analytics" would
    // be a latency regression that nothing else in the suite would notice.
    let calls = 0;
    server.use(http.post(`${API_BASE}/v1/voice-command/parse`, () => {
      calls += 1;
      return HttpResponse.json({ kind: 'reject', reason: 'unsupported' });
    }));

    renderApp('/healthcare');
    await speak('go to Analytics');

    await waitFor(() => expect(routeIs('/analytics/summary')).toBeInTheDocument());
    expect(calls).toBe(0);
  });

  it('never asks the server to break a tie it already found', async () => {
    // An ambiguity is two equally valid readings; no language understanding can
    // choose between them, so it goes to the user, not over the wire.
    let calls = 0;
    server.use(http.post(`${API_BASE}/v1/voice-command/parse`, () => {
      calls += 1;
      return HttpResponse.json({ kind: 'navigate', targetId: 'nav.analytics.agents' });
    }));

    renderApp('/healthcare');
    await speak('open agents');

    await waitFor(() => expect(screen.getAllByText(/Do you mean/).length).toBeGreaterThan(0));
    expect(calls).toBe(0);
    expect(routeIs('/healthcare')).toBeInTheDocument();
  });
});

describe('the mic control itself', () => {
  it('is a real button, reachable without a pointer', () => {
    renderApp('/healthcare');
    const btn = micButton();
    expect(btn.tagName).toBe('BUTTON');
    expect(btn).not.toBeDisabled();
    btn.focus();
    expect(btn).toHaveFocus();
  });

  it('reports listening state to assistive technology', async () => {
    renderApp('/healthcare');
    const btn = micButton();
    expect(btn).toHaveAttribute('aria-pressed', 'false');

    await act(async () => { fireEvent.pointerDown(btn); });
    expect(btn).toHaveAttribute('aria-pressed', 'true');

    await act(async () => { fireEvent.pointerUp(btn); });
    await waitFor(() => expect(btn).toHaveAttribute('aria-pressed', 'false'));
  });

  it('releases the microphone after every utterance', async () => {
    renderApp('/healthcare');
    await speak('go to Analytics');

    await waitFor(() => {
      const stopped = (globalThis as unknown as { __voiceStoppedTracks: string[] }).__voiceStoppedTracks;
      expect(stopped.length).toBeGreaterThan(0);
    });
  });
});

describe('low confidence asks instead of acting', () => {
  it('does not navigate on a weak transcript', async () => {
    renderApp('/healthcare');
    // 0.30 is roughly avg_logprob -1.2 — audible, but not worth acting on.
    await speak('go to Analytics', { confidence: 0.30 });

    await waitFor(() => expect(screen.getAllByText(/say it again if that is right/i).length)
      .toBeGreaterThan(0));
    expect(routeIs('/healthcare')).toBeInTheDocument();
    // It still shows what it heard, so the user can judge for themselves.
    expect(screen.getAllByText(/go to Analytics/).length).toBeGreaterThan(0);
  });

  it('acts on a strong transcript', async () => {
    renderApp('/healthcare');
    await speak('go to Analytics', { confidence: 0.90 });

    await waitFor(() => expect(routeIs('/analytics/summary')).toBeInTheDocument());
  });

  it('acts when confidence is absent, because no data is not low confidence', async () => {
    renderApp('/healthcare');
    await speak('go to Analytics', { confidence: null });

    await waitFor(() => expect(routeIs('/analytics/summary')).toBeInTheDocument());
  });

  it('acts just above the threshold and refuses just below it', async () => {
    renderApp('/healthcare');
    await speak('go to Analytics', { confidence: 0.54 });
    await waitFor(() => expect(screen.getAllByText(/say it again/i).length).toBeGreaterThan(0));
    expect(routeIs('/healthcare')).toBeInTheDocument();

    await speak('go to Analytics', { confidence: 0.56 });
    await waitFor(() => expect(routeIs('/analytics/summary')).toBeInTheDocument());
  });
});

describe('an STT failure is not blamed on the speaker', () => {
  it('says recognition is struggling when the utterance was dropped', async () => {
    renderApp('/healthcare');
    await speak('', { drop_reason: 'stt_http_429' });

    await waitFor(() => expect(screen.getAllByText(/having trouble/i).length).toBeGreaterThan(0));
    expect(routeIs('/healthcare')).toBeInTheDocument();
  });

  it('still says it did not hear anything on genuine silence', async () => {
    renderApp('/healthcare');
    await speak('', { drop_reason: 'empty' });

    await waitFor(() => expect(screen.getAllByText(/did not catch that/i).length).toBeGreaterThan(0));
  });

  it('treats a missing drop_reason as silence too', async () => {
    renderApp('/healthcare');
    await speak('', { drop_reason: null });

    await waitFor(() => expect(screen.getAllByText(/did not catch that/i).length).toBeGreaterThan(0));
  });
});


/**
 * Slice 5. Typing reaches a real controlled input; searching does not, because
 * the topbar box reads nothing back.
 */
describe('voice types into a field', () => {
  const field = () => screen.getByLabelText('Workflow name') as HTMLInputElement;

  it('puts the words into React state, not just the DOM', async () => {
    renderApp('/flows', <VoiceInput target={FLOWS_NAME} />);

    await speak('type onboarding into the workflow name');

    // Asserted on state, not on field().value. The DOM holds the words either
    // way — see VoiceInput — so only this can tell a real type from one whose
    // change event react-dom swallowed. It is also the value Save would send.
    await waitFor(() => expect(screen.getByText('state:onboarding')).toBeInTheDocument());
    expect(field().value).toBe('onboarding');
  });

  it('keeps a multi-word value whole', async () => {
    renderApp('/flows', <VoiceInput target={FLOWS_NAME} />);

    await speak('type q4 refund escalation into the workflow name');

    await waitFor(() =>
      expect(screen.getByText('state:q4 refund escalation')).toBeInTheDocument());
  });

  it('says what it typed and where', async () => {
    renderApp('/flows', <VoiceInput target={FLOWS_NAME} />);
    await speak('type onboarding into the workflow name');

    await waitFor(() => expect(
      screen.getAllByText(/typed onboarding into Workflow name/i).length,
    ).toBeGreaterThan(0));
  });

  it('focuses the field when it is only named', async () => {
    renderApp('/flows', <VoiceInput target={FLOWS_NAME} />);

    await speak('workflow name');

    await waitFor(() => expect(document.activeElement).toBe(field()));
    expect(field().value).toBe('');
  });

  it('types nothing when the named field is not on screen', async () => {
    renderApp('/flows');
    serverSays({ kind: 'reject', reason: 'unknown_target' });

    await speak('type onboarding into the workflow name');

    expect(screen.queryByLabelText('Workflow name')).toBeNull();
  });
});

describe('voice will not pretend to search', () => {
  it('focuses the search box when it is named', async () => {
    // The half that works: Cmd-K, by voice.
    renderApp('/flows', <VoiceInput target={GLOBAL_SEARCH} />);

    await speak('search box');

    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByLabelText('Search')));
  });

  it('refuses to search and never claims it did', async () => {
    renderApp('/flows', <VoiceInput target={GLOBAL_SEARCH} />);

    await speak('search for refunds');

    await waitFor(() => expect(
      screen.getAllByText(/not connected yet/i).length,
    ).toBeGreaterThan(0));
    // The words must not appear in the box either — text sitting there is its
    // own false signal that something was submitted.
    expect((screen.getByLabelText('Search') as HTMLInputElement).value).toBe('');
    expect(screen.queryByText(/searching/i)).toBeNull();
  });

  it('costs no tool call to refuse', async () => {
    let calls = 0;
    server.use(http.post(`${API_BASE}/v1/voice-command/parse`, () => {
      calls += 1;
      return HttpResponse.json({ kind: 'reject', reason: 'unsupported' });
    }));

    renderApp('/flows', <VoiceInput target={GLOBAL_SEARCH} />);
    await speak('search for refunds');

    await waitFor(() => expect(
      screen.getAllByText(/not connected yet/i).length,
    ).toBeGreaterThan(0));
    expect(calls).toBe(0);
  });
});

/**
 * Scrolling, end to end through the real pipeline.
 *
 * jsdom has no layout engine, so nothing ever overflows and findScroller()
 * correctly finds nothing to scroll. That makes this a genuine wiring test
 * rather than a weak one: reaching "There is nothing to scroll here." proves
 * parseLocal produced a scroll, validate passed it, and the executor hit its
 * scroll branch. A missing grammar would have gone to the server, and a missing
 * executor branch would have said "I cannot do that yet."
 *
 * The distances themselves are asserted exactly in tests/unit/voice/execute.test.ts,
 * which is the only place they can be.
 */
describe('voice scrolls the page', () => {
  it('reaches the scroll branch and reports honestly when nothing can scroll', async () => {
    renderApp('/healthcare');

    await speak('scroll down');

    await waitFor(() => expect(
      screen.getAllByText(/nothing to scroll here/i).length,
    ).toBeGreaterThan(0));
  });

  it('never asks the server about a direction it understood', async () => {
    let calls = 0;
    server.use(http.post(`${API_BASE}/v1/voice-command/parse`, () => {
      calls += 1;
      return HttpResponse.json({ kind: 'reject', reason: 'unsupported' });
    }));

    renderApp('/healthcare');
    await speak('scroll to the bottom');

    await waitFor(() => expect(
      screen.getAllByText(/nothing to scroll here/i).length,
    ).toBeGreaterThan(0));
    expect(calls).toBe(0);
  });

  it('does ask the server for a distance it has no unit for', async () => {
    // "scroll down a bit" is a miss on purpose — the server can answer it with
    // an explicit pixel amount.
    let calls = 0;
    server.use(http.post(`${API_BASE}/v1/voice-command/parse`, () => {
      calls += 1;
      return HttpResponse.json({ kind: 'scroll', direction: 'down', amount: 200 });
    }));

    renderApp('/healthcare');
    await speak('scroll down a bit');

    await waitFor(() => expect(calls).toBe(1));
  });
});
