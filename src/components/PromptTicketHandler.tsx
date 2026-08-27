/**
 * PromptTicketHandler — "Open in Candy" prompt handoff, sessionStorage-fallback path.
 *
 * AppContext's SSO-token interceptor owns claiming any `?ticket=` that arrives on a real
 * login redirect (the confirmed-live code path — see its comment for why). This component
 * ONLY handles a ticket left behind in sessionStorage by some other flow (e.g.
 * redirectToOIDC's stash) that AppContext's interceptor never saw — it deliberately does
 * NOT also read window.location.search, since doing so raced AppContext for the same
 * single-use ticket (confirmed live: 3 concurrent /prompts/claim calls, 1 success, 2 404s).
 *
 * The picker modal itself is rendered once, in App.tsx, from the context's `claimedPrompt`.
 * This component used to keep its own `pickerData` state and render a SECOND copy of the
 * modal — two independent paths into one modal, which is how the duplicate-claim bug above
 * stayed invisible for so long. Both paths now feed the same piece of state.
 */
import { useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { claimPromptTicket } from '../api/prompts';
import { PENDING_PROMPT_TICKET_KEY } from '../utils/sso';
import { logger } from '../utils/logger';

export default function PromptTicketHandler() {
  const { user, addToast, claimedPrompt, setClaimedPrompt } = useApp();
  const hasClaimed = useRef(false);

  useEffect(() => {
    if (!user || hasClaimed.current) return;

    // Only sessionStorage is checked here — see the file header.
    const ticket = sessionStorage.getItem(PENDING_PROMPT_TICKET_KEY);
    if (!ticket) return;

    hasClaimed.current = true;
    sessionStorage.removeItem(PENDING_PROMPT_TICKET_KEY);

    claimPromptTicket(ticket)
      .then((data) => {
        logger.info('[PromptTicketHandler] claimed prompt ticket', {
          promptId: data.prompt_id,
          matches: data.matching_agents.length,
        });
        // Always show the picker, even for a single match — the user should
        // confirm which agent gets the prompt rather than being auto-routed.
        setClaimedPrompt(data);
      })
      .catch((err) => {
        logger.warn('[PromptTicketHandler] claim failed', { error: err });
        addToast('That prompt link is invalid or has expired.', 'error');
      });
  }, [user, addToast, setClaimedPrompt]);

  // Strip ?ticket= from URL only after the modal closes (user picked an agent).
  // This keeps the route stable while the picker is open.
  useEffect(() => {
    if (claimedPrompt !== null) return;
    if (!hasClaimed.current) return;

    const params = new URLSearchParams(window.location.search);
    if (params.has('ticket')) {
      params.delete('ticket');
      const cleaned = params.toString();
      window.history.replaceState(
        {}, '',
        window.location.pathname + (cleaned ? `?${cleaned}` : '') + window.location.hash,
      );
    }
  }, [claimedPrompt]);

  return null;
}
