/**
 * api/voiceCommand.ts — ask the server what an utterance meant.
 *
 * Only reached when voice/parseLocal.ts returns `miss`. "Go to Analytics" is
 * answered from the registry in microseconds and never comes here; this is the
 * slow path, for phrasings the local grammar does not cover.
 *
 * What is sent, and what is deliberately not
 * ──────────────────────────────────────────
 * The request carries the ids that are on screen right now, so the model can
 * only choose from things that actually exist — and the server re-checks its
 * answer against that same list before replying (runtime/voice_intent.py).
 *
 * `path` is stripped here. The server has no use for a route and no business
 * knowing one: an action carries an id, and the destination is read off the
 * local registry by voice/execute.ts. Not sending paths means no answer from
 * the server can contain one, which is invariant 1 of voice/types.ts held
 * across the network boundary rather than only inside the browser.
 * `destructive` is withheld for the same class of reason — confirmation is
 * validate.ts's decision, and sending the flag would invite the model to
 * reason about whether to skip it.
 */
import { api } from './client';
import { logger } from '../utils/logger';
import type { ScreenSnapshot, VoiceAction } from '../voice/types';

/**
 * A voice turn that takes longer than this has already failed as an
 * interaction — the user has been standing there since they let go of the
 * button. Well under client.ts's 60s default, which is sized for website
 * crawls and long generations rather than for someone waiting to be answered.
 */
const PARSE_TIMEOUT_MS = 8_000;

/** Every `kind` in voice/types.ts's VoiceAction union. */
const ACTION_KINDS = new Set([
  'navigate', 'click', 'type', 'select', 'openTab', 'scroll',
  'back', 'forward', 'search', 'confirm', 'cancel', 'clarify', 'reject',
]);

/**
 * Confirm the response is an action shape before it is treated as one.
 *
 * validateAction()'s switch has no default branch — it is exhaustive over the
 * union, which is a guarantee the compiler makes about our own code and not
 * about bytes off the network. An unrecognised `kind` would fall through it and
 * return undefined, and the hook would then read `.status` of undefined. One
 * membership test turns that into an honest "I did not understand".
 */
function asVoiceAction(raw: unknown): VoiceAction | null {
  if (!raw || typeof raw !== 'object') return null;
  const kind = (raw as { kind?: unknown }).kind;
  if (typeof kind !== 'string' || !ACTION_KINDS.has(kind)) return null;
  return raw as VoiceAction;
}

/**
 * Parse one utterance against one screen.
 *
 * Returns null when the server could not answer — a 503 from an unreachable
 * model, a timeout, or a response that is not an action. Null means "ask
 * again", and is deliberately distinct from a `reject` action, which is the
 * server successfully telling us the command cannot be carried out. Nothing
 * here throws: the caller is a voice turn, and every outcome needs a sentence
 * rather than a stack.
 */
export async function parseCommand(
  transcript: string,
  snapshot:   ScreenSnapshot,
): Promise<VoiceAction | null> {
  try {
    const raw = await api<unknown>('/v1/voice-command/parse', {
      method: 'POST',
      timeoutMs: PARSE_TIMEOUT_MS,
      body: {
        transcript,
        route:    snapshot.route,
        route_id: snapshot.routeId,
        title:    snapshot.title,
        // Narrowed on purpose — see the header note on path/destructive.
        //
        // `unavailable` targets are left out entirely. They resolve to a spoken
        // sentence, never to an action (actionFor() in parseLocal.ts), so the
        // only thing the model could do with one is name it in a click the
        // browser would then refuse — and that refusal comes back as a bare
        // `unavailable` reason code, losing the specific sentence the target
        // carries. Offering them can only make the answer worse.
        targets: snapshot.targets
          .filter(t => !t.unavailable)
          .map(t => ({
            id:      t.id,
            kind:    t.kind,
            label:   t.label,
            aliases: t.aliases,
            section: t.section ?? null,
          })),
      },
    });

    const action = asVoiceAction(raw);
    if (!action) {
      logger.warn('[voice] parse endpoint returned an unrecognised action', raw);
      return null;
    }
    return action;
  } catch (err) {
    logger.warn('[voice] parse request failed', err);
    return null;
  }
}
