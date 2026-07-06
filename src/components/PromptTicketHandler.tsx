/**
 * PromptTicketHandler — "Open in Candy" prompt handoff entry point.
 *
 * Mirrors Finixy_workflow's SSOHandler pattern (src/App.tsx `claimPromptTicket`):
 * detect a `?ticket=` on the URL (or one stashed in sessionStorage by
 * redirectToOIDC before a login redirect dropped it), claim it once the user is
 * authenticated, then always open PromptAgentPickerModal so the user confirms
 * which agent gets the prompt (even for a single match, per product decision).
 *
 * Reads the ticket off window.location.search directly (not useSearchParams)
 * because this app uses HashRouter — the same reason AppContext's own SSO-token
 * interception (a few lines above) reads window.location.search raw instead of
 * relying on the router's parsed location.
 */
import { useEffect, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { claimPromptTicket, type ClaimedPrompt } from '../api/prompts';
import { PENDING_PROMPT_TICKET_KEY } from '../utils/sso';
import { logger } from '../utils/logger';
import PromptAgentPickerModal from './agent/PromptAgentPickerModal';

export default function PromptTicketHandler() {
  const { user, addToast } = useApp();
  const hasClaimed = useRef(false);
  const [pickerData, setPickerData] = useState<ClaimedPrompt | null>(null);

  useEffect(() => {
    if (!user || hasClaimed.current) return;

    const params = new URLSearchParams(window.location.search);
    const ticket = params.get('ticket') || sessionStorage.getItem(PENDING_PROMPT_TICKET_KEY);
    if (!ticket) return;

    hasClaimed.current = true;
    sessionStorage.removeItem(PENDING_PROMPT_TICKET_KEY);

    // Strip ?ticket= from the address bar so it can't be replayed. Must keep
    // window.location.hash — this is a HashRouter app, so the current route
    // (e.g. "#/dashboard") lives there; dropping it would revert the visible
    // URL to the bare origin even though the app is still on that page.
    if (params.has('ticket')) {
      params.delete('ticket');
      const cleaned = params.toString();
      window.history.replaceState(
        {}, '',
        window.location.pathname + (cleaned ? `?${cleaned}` : '') + window.location.hash,
      );
    }

    claimPromptTicket(ticket)
      .then((data) => {
        logger.info('[PromptTicketHandler] claimed prompt ticket', {
          promptId: data.prompt_id,
          matches: data.matching_agents.length,
        });
        // Always show the picker, even for a single match — the user should
        // confirm which agent gets the prompt rather than being auto-routed.
        setPickerData(data);
      })
      .catch((err) => {
        logger.warn('[PromptTicketHandler] claim failed', { error: err });
        addToast('That prompt link is invalid or has expired.', 'error');
      });
  }, [user, addToast]);

  if (!pickerData) return null;

  return (
    <PromptAgentPickerModal
      promptTitle={pickerData.title}
      promptContent={pickerData.content}
      matchingAgents={pickerData.matching_agents}
      onClose={() => setPickerData(null)}
    />
  );
}
