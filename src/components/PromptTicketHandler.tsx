/**
 * PromptTicketHandler — "Open in Candy" prompt handoff, sessionStorage-fallback path.
 *
 * AppContext's SSO-token interceptor now owns claiming any `?ticket=` that arrives on a
 * real login redirect (the confirmed-live code path — see its comment for why). This
 * component ONLY handles a ticket left behind in sessionStorage by some other flow (e.g.
 * redirectToOIDC's stash) that AppContext's interceptor never saw — it deliberately does
 * NOT also read window.location.search, since doing so raced AppContext for the same
 * single-use ticket (confirmed live: 3 concurrent /prompts/claim calls, 1 success, 2 404s).
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

  console.log('[PromptTicketHandler] render', { user: !!user, pickerData: !!pickerData, hasClaimed: hasClaimed.current });

  useEffect(() => {
    console.log('[PromptTicketHandler] useEffect check', { user: !!user, hasClaimed: hasClaimed.current });
    if (!user || hasClaimed.current) return;

    // AppContext's own SSO-token interceptor (the ONLY code path confirmed to actually run
    // on a real OIDC/SSO login redirect — see its comment) now claims any `?ticket=` arriving
    // in window.location.search itself, directly, the instant login succeeds. This component
    // must NOT also read that same query param — doing so raced AppContext's claim for the
    // exact same single-use ticket (three concurrent /prompts/claim calls observed live, two
    // aborted, one 404 "already used"). Only sessionStorage is checked here now, for a ticket
    // stashed by some OTHER flow (e.g. redirectToOIDC's fallback) that AppContext never saw.
    const ticket = sessionStorage.getItem(PENDING_PROMPT_TICKET_KEY);
    console.log('[PromptTicketHandler] ticket detection', { ticket, sessionStorageTicket: sessionStorage.getItem(PENDING_PROMPT_TICKET_KEY) });
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
        setPickerData(data);
      })
      .catch((err) => {
        logger.warn('[PromptTicketHandler] claim failed', { error: err });
        addToast('That prompt link is invalid or has expired.', 'error');
      });
  }, [user, addToast]);

  // Strip ?ticket= from URL only after modal closes (user picked an agent).
  // This keeps the route stable while the picker is open.
  useEffect(() => {
    if (pickerData !== null) return;
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
  }, [pickerData]);

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
