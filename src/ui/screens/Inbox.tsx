import { useGame } from '../../store/game';
import { MANAGERS } from '../../engine/company';
import { inbox } from '../../engine/inbox';
import type { InboxCard, WorldState } from '../../engine/types';
import { Portrait } from '../art/Scenes';
import { Badge, Button, Card, Screen, SectionTitle, cx } from '../components/core';
import { SubHeader } from './More';

const FROM_ICON: Record<string, string> = {
  'Union rep': '✊', 'Sales team': '🤝', Purchasing: '📦', HR: '🧑‍💼', 'Quality team': '🔍', 'Plant engineer': '🔧',
  'Marketing team': '📣', Accounts: '💵', 'Press office': '🎙️',
};

export function InboxScreen() {
  const w = useGame((s) => s.world)!;
  const list = inbox(w);
  const open = list.filter((x) => !x.answered).sort((a, b) => a.expires - b.expires);
  const done = list.filter((x) => x.answered).sort((a, b) => b.answered!.day - a.answered!.day).slice(0, 12);
  return (
    <div>
      <SubHeader title="Inbox" sub="Decisions your teams bring you each month" />
      <Screen>
        <p className="text-sm text-muted mt-3">
          Every month your staff and customers bring you decisions, and rivals get in touch whenever they make a move. Each one has a trade-off. If you don't answer within two weeks, the default happens, and it's rarely the best choice. A hired manager (Company › Overview › Running the business) can answer for you.
        </p>
        {open.length === 0 && <Card className="mt-3 p-4 text-sm text-muted">Nothing waiting. New decisions arrive every month.</Card>}
        <div className="space-y-3 mt-3">{open.map((c) => <OpenCard key={c.id} w={w} card={c} />)}</div>
        {done.length > 0 && <SectionTitle>Decided recently</SectionTitle>}
        <div className="space-y-2">
          {done.map((c) => {
            const pick = c.choices.find((x) => x.id === c.answered!.choiceId);
            return (
              <Card key={c.id} className="p-3">
                <div className="flex items-center gap-2 text-xs text-dim">
                  <span>Day {c.answered!.day}</span>
                  <Badge tone={c.answered!.by === 'you' ? 'gold' : c.answered!.by === 'manager' ? 'neutral' : 'warn'}>{c.answered!.by === 'you' ? 'You' : c.answered!.by === 'manager' ? 'Manager' : 'Timed out'}</Badge>
                </div>
                <div className="font-semibold text-sm mt-1">{c.title}</div>
                <div className="text-xs text-muted">{pick?.label}: {c.answered!.message}</div>
              </Card>
            );
          })}
        </div>
      </Screen>
    </div>
  );
}

function OpenCard({ w, card }: { w: WorldState; card: InboxCard }) {
  const dispatch = useGame((s) => s.dispatch);
  const push = useGame((s) => s.push);
  const co = w.companies.find((x) => x.id === card.companyId);
  const rv = card.rivalId ? w.rivals.find((x) => x.id === card.rivalId) : undefined;
  const left = card.expires - w.day;
  const fallback = card.choices.find((x) => x.id === card.fallback);
  const mgr = co?.manager ?? 'none';
  return (
    <Card className={cx('p-3', rv && card.kind !== 'rivalHello' && 'border-red/40')}>
      <div className="flex items-start gap-3">
        {rv ? <Portrait rival={rv} size={44} /> : <span className="grid place-items-center size-11 shrink-0 rounded-full bg-card-2 border border-line text-xl" aria-hidden>{FROM_ICON[card.from] ?? '✉️'}</span>}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap text-xs text-dim">
            <span className="font-semibold text-muted">{card.from}</span>
            {co && <button className="text-gold font-semibold" onClick={() => push({ screen: 'company', id: co.id })}>{co.name}</button>}
          </div>
          <div className="font-bold mt-0.5">{card.title}</div>
        </div>
      </div>
      <p className="text-sm text-muted mt-2">{card.body}</p>
      <div className="grid gap-2 mt-3">
        {card.choices.map((ch, i) => (
          <Button key={ch.id} variant={i === 0 ? 'gold' : 'ghost'} block onClick={() => dispatch({ type: 'answerInbox', cardId: card.id, choiceId: ch.id })}>
            <span className="flex flex-col items-start text-left w-full">
              <span className="font-semibold">{ch.label}</span>
              <span className={cx('text-xs font-normal', i === 0 ? 'opacity-80' : 'text-dim')}>{ch.detail}</span>
            </span>
          </Button>
        ))}
      </div>
      <div className={cx('text-xs mt-2', left <= 2 ? 'text-amber' : 'text-dim')}>
        {mgr !== 'none'
          ? `${MANAGERS[mgr].label} will answer ${mgr === 'pro' ? 'tomorrow' : 'in a couple of days'} if you don't.`
          : `If you don't decide in ${Math.max(0, left)} day${left === 1 ? '' : 's'}: ${fallback?.label ?? 'nothing happens'}.`}
      </div>
    </Card>
  );
}
