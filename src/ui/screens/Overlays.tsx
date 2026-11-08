import { useEffect, useRef, useState } from 'react';
import { useGame } from '../../store/game';
import { Portrait } from '../art/art';
import { BottomSheet, Button } from '../components/core';
import { IconBolt } from '../components/Icons';

/** Taps in the first moments after the sheet opens are ignored: they were meant for the screen behind it. */
const TAP_GUARD_MS = 700;

/**
 * Event choices as a bottom sheet. New events pause the game and open automatically. Tapping a
 * choice only selects it; nothing happens until you press Confirm, so a stray tap cannot decide.
 */
export function EventSheet() {
  const ev = useGame((s) => s.world?.pending[0]);
  const open = useGame((s) => s.eventOpen);
  const rivals = useGame((s) => s.world?.rivals);
  const dispatch = useGame((s) => s.dispatch);
  const seen = useRef<string | null>(null);
  const openedAt = useRef(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (ev && seen.current !== ev.id) {
      seen.current = ev.id;
      setPicked(null);
      useGame.getState().setSpeed(0);
      useGame.setState({ eventOpen: true });
    }
  }, [ev]);
  useEffect(() => {
    if (open) openedAt.current = Date.now();
  }, [open, ev?.id]);
  if (!ev || !open) return null;
  const rival = rivals?.find((r) => r.id === ev.rivalId);
  const choice = ev.choices.find((c) => c.id === picked);
  const tooSoon = () => Date.now() - openedAt.current < TAP_GUARD_MS;
  const confirm = () => {
    if (!choice || busy || tooSoon()) return;
    setBusy(true);
    dispatch({ type: 'resolveEvent', eventId: ev.id, choiceId: choice.id }).finally(() => {
      setBusy(false);
      setPicked(null);
      useGame.setState({ eventOpen: false });
    });
  };
  return (
    <BottomSheet open onClose={() => useGame.setState({ eventOpen: false })} title={<span className="flex items-center gap-2 text-amber"><IconBolt /> {ev.title}</span>}>
      <div className="flex gap-3 items-start">
        {rival && <Portrait rival={rival} size={64} />}
        <p className="text-base leading-relaxed flex-1">{ev.body}</p>
      </div>
      <div className="space-y-2 mt-4" role="radiogroup" aria-label="Your choice">
        {ev.choices.map((c) => {
          const on = c.id === picked;
          return (
            <button
              key={c.id}
              role="radio"
              aria-checked={on}
              aria-label={c.label}
              onClick={() => { if (!tooSoon()) setPicked(c.id); }}
              className={`w-full flex items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors ${on ? 'border-gold bg-gold/10' : 'border-line bg-card-2 hover:border-line-strong'}`}
            >
              <span className={`mt-0.5 size-5 shrink-0 rounded-full border-2 grid place-items-center ${on ? 'border-gold' : 'border-line-strong'}`}>
                {on && <span className="size-2.5 rounded-full bg-gold" />}
              </span>
              <span className="flex-1 min-w-0">
                <span className="block font-bold">{c.label}</span>
                <span className="block text-xs text-muted">{c.detail}</span>
              </span>
            </button>
          );
        })}
      </div>
      <div className="flex gap-2 mt-4">
        <Button variant="ghost" size="lg" className="shrink-0" onClick={() => useGame.setState({ eventOpen: false })}>Decide later</Button>
        <Button size="lg" className="flex-1" disabled={!choice || busy} onClick={confirm}>{choice ? 'Confirm' : 'Pick an option'}</Button>
      </div>
      <p className="text-xs text-dim mt-3">The game stays paused. If you don't decide by day {ev.expiresDay}, the last option is taken.</p>
    </BottomSheet>
  );
}
