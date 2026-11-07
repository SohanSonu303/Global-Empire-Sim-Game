import { useEffect, useRef } from 'react';
import { useGame } from '../../store/game';
import { Portrait } from '../art/art';
import { BottomSheet, Button } from '../components/core';
import { IconBolt } from '../components/Icons';

/** Event choices as a bottom sheet. New events pause the game and open automatically. */
export function EventSheet() {
  const ev = useGame((s) => s.world?.pending[0]);
  const open = useGame((s) => s.eventOpen);
  const rivals = useGame((s) => s.world?.rivals);
  const dispatch = useGame((s) => s.dispatch);
  const seen = useRef<string | null>(null);
  useEffect(() => {
    if (ev && seen.current !== ev.id) {
      seen.current = ev.id;
      useGame.getState().setSpeed(0);
      useGame.setState({ eventOpen: true });
    }
  }, [ev]);
  if (!ev || !open) return null;
  const rival = rivals?.find((r) => r.id === ev.rivalId);
  return (
    <BottomSheet open onClose={() => useGame.setState({ eventOpen: false })} title={<span className="flex items-center gap-2 text-amber"><IconBolt /> {ev.title}</span>}>
      <div className="flex gap-3 items-start">
        {rival && <Portrait rival={rival} size={64} />}
        <p className="text-base leading-relaxed flex-1">{ev.body}</p>
      </div>
      <div className="space-y-2 mt-4">
        {ev.choices.map((c, i) => (
          <Button
            key={c.id}
            block
            size="lg"
            variant={i === 0 ? 'gold' : 'dark'}
            className="flex-col items-start text-left gap-0 py-2"
            onClick={() => dispatch({ type: 'resolveEvent', eventId: ev.id, choiceId: c.id }).then(() => useGame.setState({ eventOpen: false }))}
          >
            <span>{c.label}</span>
            <span className="text-xs font-medium opacity-75">{c.detail}</span>
          </Button>
        ))}
      </div>
      <p className="text-xs text-dim mt-3">If you don't decide by day {ev.expiresDay}, the last option is taken.</p>
    </BottomSheet>
  );
}
