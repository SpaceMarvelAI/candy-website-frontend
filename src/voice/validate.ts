/**
 * voice/validate.ts — the gate between "the model said so" and "the app did it".
 *
 * Everything upstream of this file is untrusted: a transcript can be misheard,
 * and the parse endpoint is an LLM. Nothing reaches the executor without
 * passing every check here.
 *
 * Three properties this file is responsible for:
 *
 *   · An action can only name a target that is on screen *right now*. The
 *     snapshot is the visibility filter — if it is not in `snapshot.targets`,
 *     it does not exist as far as voice is concerned. This is also what stops
 *     a fabricated id from doing anything.
 *
 *   · Kinds have to line up. `type` into a button or `select` on a nav item is
 *     rejected rather than attempted, because the executor would otherwise
 *     dispatch events at an element that cannot handle them.
 *
 *   · Destructive targets never run on the first utterance. They come back as
 *     `needs_confirmation` and only execute after the user says so out loud.
 *
 * Note what is absent: there is no branch anywhere that turns spoken text into
 * a route, a selector or markup. `navigate` carries an id; the destination is
 * read off the registered target by the executor. That is the single reason a
 * hostile transcript cannot reach the DOM.
 */
import { GLOBAL_SEARCH } from './registry/navTargets';
import type {
  ExecutableAction, RejectReason, ScreenSnapshot, Validation, VoiceAction,
  VoiceTarget, VoiceTargetKind,
} from './types';

/** Long enough for a real search or form value, short enough to be a sentence. */
const MAX_VALUE_LENGTH = 500;

const SCROLL_DIRECTIONS = new Set(['up', 'down', 'top', 'bottom']);

function reject(reason: RejectReason, message: string): Validation {
  return { status: 'rejected', reason, message };
}

function ok(action: ExecutableAction): Validation {
  return { status: 'ok', action };
}

function findVisible(snapshot: ScreenSnapshot, id: string): VoiceTarget | undefined {
  return snapshot.targets.find(t => t.id === id);
}

function isUsableText(value: unknown): value is string {
  return typeof value === 'string'
    && value.trim().length > 0
    && value.length <= MAX_VALUE_LENGTH;
}

export interface ValidateOptions {
  /** The user has spoken confirmation for this exact action already. */
  confirmed?: boolean;
}

/**
 * Resolve an action against what is on screen. Returns the action unchanged on
 * success — validation narrows the type, it never rewrites the action.
 */
export function validateAction(
  action: VoiceAction,
  snapshot: ScreenSnapshot,
  opts: ValidateOptions = {},
): Validation {
  switch (action.kind) {
    case 'clarify':
    case 'reject':
      return reject('not_executable', 'That was a question, not an action.');

    case 'back':
    case 'forward':
    case 'confirm':
    case 'cancel':
      return ok(action);

    case 'scroll': {
      if (!SCROLL_DIRECTIONS.has(action.direction)) {
        return reject('invalid_value', 'I can scroll up, down, to the top or to the bottom.');
      }
      if (action.amount !== undefined && (!Number.isFinite(action.amount) || action.amount <= 0)) {
        return reject('invalid_value', 'That scroll amount does not make sense.');
      }
      return ok(action);
    }

    case 'search': {
      if (!isUsableText(action.query)) {
        return reject('invalid_value', 'I did not catch what to search for.');
      }
      if (!findVisible(snapshot, GLOBAL_SEARCH.id)) {
        return reject('not_visible', 'There is no search box on this screen.');
      }
      return ok(action);
    }

    case 'navigate':  return withTarget(action, snapshot, opts, ['nav', 'tab'], true);
    case 'openTab':   return withTarget(action, snapshot, opts, ['tab'], false);
    // 'input' and 'select' are clickable because naming a field without saying
    // what to put in it means "put my cursor there" — the executor focuses
    // before it clicks, so a text box gets the caret and a <select> opens its
    // list. No value is entered and no option is chosen, so a misheard
    // utterance cannot change data down this path.
    case 'click':
      return withTarget(action, snapshot, opts, ['button', 'nav', 'tab', 'input', 'select'], false);

    case 'type': {
      if (!isUsableText(action.value)) {
        return reject('invalid_value', 'I did not catch what to type.');
      }
      return withTarget(action, snapshot, opts, ['input'], false);
    }

    case 'select': {
      if (!isUsableText(action.option)) {
        return reject('invalid_value', 'I did not catch which option to pick.');
      }
      return withTarget(action, snapshot, opts, ['select'], false);
    }
  }
}

/**
 * Shared checks for every action that names a target: it is on screen, it is
 * the right kind of thing, it actually goes somewhere, and it is not something
 * that should be confirmed out loud first.
 */
function withTarget(
  action: Extract<ExecutableAction, { targetId: string }>,
  snapshot: ScreenSnapshot,
  opts: ValidateOptions,
  allowed: readonly VoiceTargetKind[],
  requiresPath: boolean,
): Validation {
  const target = findVisible(snapshot, action.targetId);
  if (!target) {
    return reject('unknown_target', 'I could not find that on this screen.');
  }
  if (target.unavailable) {
    return reject('unavailable', target.unavailable);
  }
  if (!allowed.includes(target.kind)) {
    return reject('wrong_kind', `I cannot do that to ${target.label}.`);
  }
  if (requiresPath && !target.path) {
    return reject('wrong_kind', `${target.label} is not somewhere I can navigate to.`);
  }
  if (target.destructive && !opts.confirmed) {
    return {
      status: 'needs_confirmation',
      action,
      target,
      prompt: `${target.label} cannot be undone. Say confirm to go ahead, or cancel.`,
    };
  }
  return ok(action);
}
