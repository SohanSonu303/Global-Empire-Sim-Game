import { useMemo } from 'react';
import { attentionByCompany, computeAdvice, type Advice, type AdviceAction } from '../engine/advisor';
import { useGame } from '../store/game';

/** Assistant advice for the current snapshot, recomputed only when the world changes. */
export function useAdvice(): Advice[] {
  const w = useGame((s) => s.world);
  return useMemo(() => (w ? computeAdvice(w) : []), [w]);
}

export function useAttention(): Record<string, Advice['severity']> {
  const advice = useAdvice();
  return useMemo(() => attentionByCompany(advice), [advice]);
}

/** Carry out an assistant action. */
export function runAction(a: AdviceAction): void {
  const s = useGame.getState();
  switch (a.type) {
    case 'command': void s.dispatch(a.cmd); break;
    case 'openCompany': s.push({ screen: 'company', id: a.companyId, tab: a.tab }); break;
    case 'openPlanner': s.push({ screen: 'planner', good: a.good }); break;
    case 'openEvent': useGame.setState({ eventOpen: true }); break;
    case 'openMarkets': s.setTab('markets'); break;
    case 'openInbox': s.push({ screen: 'inbox' }); break;
    case 'openWarehouses': s.push({ screen: 'strategy', tab: 'warehouses' }); break;
    case 'openContracts': s.push({ screen: 'strategy', tab: 'contracts' }); break;
    case 'openCountry': s.push({ screen: 'country', id: a.country }); break;
    case 'openNews': s.push({ screen: 'news' }); break;
    case 'openTender': s.setSpeed(0); s.push({ screen: 'tender', id: a.tenderId }); break;
  }
}
