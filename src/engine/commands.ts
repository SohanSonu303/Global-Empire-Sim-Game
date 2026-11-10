import { hireStaff } from './business';
import { GOODS, INDUSTRIES, LEVEL_CAP_MULT, MAX_LEVEL, UPGRADE_COST_GROWTH, maxPriceMult, requiredCapital, startCost, upgradeCost } from './data';
import { foundPrice, noteOpsSaved, swapTrait } from './traits';
import { buyLicence, grantLicence, grantPermit, hasLicence, licenceFee, licences, permitFee } from './licences';
import { applyUpgrade, clamp, drawCredit, nextUpgradeCost, salaryOf, wageIndex, workersNeeded } from './company';
import { cancelContract, offerContract } from './contracts';
import { resolveEvent } from './events';
import { MAX_RATE_MULT, MIN_RATE_MULT, ensureBanks, isBank, willLend } from './banks';
import { addFoundingPartner, agreedPartner, bidCompany, buyBackStake, buyStake, foundingPartners, outsidePct, pitchPartner, sellCompany, sellStake } from './ownership';
import { maxFillToday, stockByTicker, tryFill } from './market';
import { addNews, fmtMoney } from './news';
import { addXp, claimGoal, netWorth } from './progress';
import { checkIn } from './rewards';
import { acceptJob, bidInTender, endWar, joinTender, passTender, startCampaign } from './strategy';
import { buildWarehouse, releaseStock, setBuyOrder, setLimit, setSellRule, setSplit as setSplitCmd, sellToRivals, sendStock, upgradeWarehouse } from './warehouse';
import { newCompany, seedInputs } from './world';
import { COVER, premiumPerDay } from './disasters';
import { explore } from './resources';
import { bidAuction } from './auctions';
import { answerInbox } from './inbox';
import { clearTips } from './advisor';
import { acceptReply, cancelRequest, postRequest } from './requests';
import { saveBudget } from './budget';
import { fireExec, hireExec, raiseExec } from './execs';
import { acceptBarter, closeOffice, exportGoods, importGoods, openOffice } from './trade';
import { acceptLicence, fireResearcher, hireResearcher, offerLicence, startProject, stopProject } from './research';
import { rivalNotices } from './rivalry';
import { MAINT, MANAGERS, NEW_REACH, NEW_SKILL } from './company';
import type { Command, CommandResult, Company, Order, WorldState } from './types';

const ok = (message: string): CommandResult => ({ ok: true, message });
const fail = (message: string): CommandResult => ({ ok: false, message });

function myCompany(w: WorldState, id: string): Company | undefined {
  return w.companies.find((c) => c.id === id && c.isPlayer && !c.bankrupt);
}

/** Apply a player command between ticks. Deterministic given (state, command). */
export function applyCommand(w: WorldState, cmd: Command): CommandResult {
  switch (cmd.type) {
    case 'foundCompany': {
      const def = GOODS[cmd.good];
      if (!def) return fail('Unknown product');
      const name = cmd.name.trim().slice(0, 28);
      if (!name) return fail('Pick a name');
      if (w.companies.some((c) => c.name.toLowerCase() === name.toLowerCase())) return fail('That name is taken');
      const ind = def.industry;
      if (!hasLicence(w, ind) && licences(w).length > 0) return fail(`You need a ${INDUSTRIES[ind].name} licence first (${fmtMoney(licenceFee(w, ind))})`);
      const full = startCost(cmd.good);
      const price = foundPrice(w, cmd.good);
      const permit = permitFee(w, cmd.good);
      const total = price + permit;
      let partner: { id: string; pct: number; paid: number } | null = null;
      if (cmd.partnerId && cmd.partnerPct && cmd.partnerPct > 0) {
        const pct = clamp(Math.round(cmd.partnerPct * 100) / 100, 0.05, 0.49);
        const o = foundingPartners(w, cmd.good, total, pct).find((x) => x.id === cmd.partnerId);
        if (!o) return fail('Unknown partner');
        if (!o.ok) return fail(`${o.name}: ${o.why}`);
        if (!agreedPartner(w, cmd.good, o.id, pct)) return fail(`Agree the terms with ${o.name} first: make them an offer`);
        partner = { id: o.id, pct, paid: Math.round(total * pct) };
      }
      const mine = total - (partner?.paid ?? 0);
      if (w.player.cash < mine) return fail(`Founding costs ${fmtMoney(total)}${permit ? ` with the ${fmtMoney(permit)} permit` : ''}${partner ? `; your part is ${fmtMoney(mine)}` : ''}`);
      noteOpsSaved(w, full - price);
      grantLicence(w, ind); // your first industry's licence is free
      w.player.cash -= mine;
      if (permit > 0) {
        grantPermit(w, cmd.good);
        w.macro.govDebt = Math.max(0, w.macro.govDebt - permit);
      }
      w.seq += 1;
      const c = newCompany(w, { id: `p${w.seq}`, name, good: cmd.good, ownerId: 'player', isPlayer: true, ticker: null, level: 1 });
      const plant = price - requiredCapital(cmd.good);
      c.cash = plant * 0.35; // working capital; the rest is fixed assets
      c.assets = plant * 0.65;
      const capital = requiredCapital(cmd.good);
      if (capital > 0) { c.cash += capital; c.lockedCapital = capital; }
      seedInputs(w, c, 2); // a starter delivery of inputs comes with the plant
      if (cmd.priceMult) c.priceMult = Math.max(0.5, Math.min(maxPriceMult(cmd.good), cmd.priceMult));
      if (partner) { addFoundingPartner(w, c, partner.id, partner.pct, partner.paid); delete w.play.partnerDeal; }
      // A new business starts with few customers and a green team
      c.reach = def.reg ? 0.9 : NEW_REACH; // people who need care go where the beds are
      c.satisfaction = 0.75;
      c.skill = NEW_SKILL;
      w.companies.push(c);
      rivalNotices(w, c);
      w.macro.capexMonth += plant * 0.65;
      ensureBanks(w);
      addNews(w, 'player', `${name} opens its doors`, `A new ${def.name.toLowerCase()} producer enters the Astoria market.${permit ? ` The government permit cost ${fmtMoney(permit)}.` : ''}${partner ? ` ${c.partners?.[0]?.name} put in ${fmtMoney(partner.paid)} for ${Math.round(partner.pct * 100)}%.` : ''}`, 'good', [c.id]);
      return ok(`${name} founded`);
    }
    case 'downsize': {
      const c = myCompany(w, cmd.companyId);
      if (!c) return fail('Company not found');
      if (c.level <= 1) return fail('Already the smallest plant');
      const back = upgradeCost(c.good, c.level, UPGRADE_COST_GROWTH) * 0.15;
      c.level -= 1;
      c.capacity /= LEVEL_CAP_MULT;
      c.assets = Math.max(0, c.assets / LEVEL_CAP_MULT);
      c.workers = Math.min(c.workers, workersNeeded(c));
      c.automation = { ...c.automation, autoUpgrade: false };
      c.cash += back;
      addNews(w, 'player', `${c.name} closes a production line`, `Back to level ${c.level}: lower fixed costs for a plant that fits its market.`, 'neutral', [c.id]);
      return ok(`${c.name} is now level ${c.level}. Fixed costs drop about 31%. Sold equipment for ${fmtMoney(back)}`);
    }
    case 'swapTrait':
      return swapTrait(w, cmd.from, cmd.to);
    case 'upgrade': {
      const c = myCompany(w, cmd.companyId);
      if (!c) return fail('Company not found');
      if (c.level >= MAX_LEVEL) return fail('Already at max level');
      const cost = nextUpgradeCost(c);
      const fromCompany = Math.min(Math.max(0, c.cash - c.automation.minCash - (c.lockedCapital ?? 0)), cost);
      const fromPlayer = cost - fromCompany;
      if (fromPlayer > w.player.cash) return fail(`Need ${fmtMoney(cost)} (company + personal cash)`);
      c.cash -= fromCompany;
      w.player.cash -= fromPlayer;
      if (c.ops) noteOpsSaved(w, cost / 0.9 - cost);
      applyUpgrade(w, c);
      return ok(`${c.name} upgraded to level ${c.level}${fromPlayer > 0 ? ` (${fmtMoney(fromPlayer)} from you)` : ''}`);
    }
    case 'hire': {
      const c = myCompany(w, cmd.companyId);
      if (!c) return fail('Company not found');
      const n = Math.round(cmd.count);
      if (n > 0) {
        const cost = n * salaryOf(c) * 5 * wageIndex(w, c.industry);
        if (c.cash < cost) return fail(`Hiring costs ${fmtMoney(cost)} of company cash`);
        c.cash -= cost;
        hireStaff(c, n);
        return ok(`Hired ${n} staff`);
      }
      if (n < 0) {
        c.workers = Math.max(0, c.workers + n);
        c.morale = clamp(c.morale - 0.05, 0, 1);
        return ok(`Laid off ${-n} staff`);
      }
      return fail('Nothing to do');
    }
    case 'setPrice': {
      const c = myCompany(w, cmd.companyId);
      if (!c) return fail('Company not found');
      c.priceMult = clamp(cmd.priceMult, 0.5, maxPriceMult(c.good) + (c.labFx?.price ?? 0));
      c.priceSetDay = w.day;
      return ok(GOODS[c.good].reg && cmd.priceMult > c.priceMult ? 'Regulated: you cannot charge more than the market price' : 'Price updated');
    }
    case 'setSalary': {
      const c = myCompany(w, cmd.companyId);
      if (!c) return fail('Company not found');
      c.salaryMult = clamp(cmd.salaryMult, 0.6, 1.8);
      return ok('Salaries updated');
    }
    case 'setSpend': {
      const c = myCompany(w, cmd.companyId);
      if (!c) return fail('Company not found');
      c.marketingPct = clamp(cmd.marketingPct, 0, 0.15);
      c.rdPct = clamp(cmd.rdPct, 0, 0.15);
      return ok('Budget updated');
    }
    case 'setAutomation': {
      const c = myCompany(w, cmd.companyId);
      if (!c) return fail('Company not found');
      c.automation = { ...c.automation, ...cmd.automation };
      c.automation.dividendPct = clamp(c.automation.dividendPct, 0, 100);
      c.automation.inventoryDays = clamp(c.automation.inventoryDays, 0, 5);
      c.automation.minCash = Math.max(0, c.automation.minCash);
      c.automation.supplyDays = clamp(c.automation.supplyDays ?? 4, 1, 20);
      return ok('Automation updated');
    }
    case 'setSplit': {
      const c = myCompany(w, cmd.companyId);
      if (!c) return fail('Company not found');
      return setSplitCmd(w, c, cmd.split);
    }
    case 'borrow': {
      const c = myCompany(w, cmd.companyId);
      if (!c) return fail('Company not found');
      const amt = drawCredit(w, c, cmd.amount, 'you borrowed');
      if (amt <= 0) return fail('Credit limit reached');
      return ok(`Borrowed ${fmtMoney(amt)}`);
    }
    case 'repay': {
      const c = myCompany(w, cmd.companyId);
      if (!c) return fail('Company not found');
      const amt = Math.min(cmd.amount, c.debt, c.cash);
      if (amt <= 0) return fail('Nothing to repay');
      c.debt -= amt;
      c.cash -= amt;
      return ok(`Repaid ${fmtMoney(amt)}`);
    }
    case 'transfer': {
      const c = myCompany(w, cmd.companyId);
      if (!c) return fail('Company not found');
      if (cmd.amount > 0) {
        const amt = Math.min(cmd.amount, w.player.cash);
        if (amt <= 0) return fail('No personal cash');
        w.player.cash -= amt;
        c.cash += amt;
        return ok(`Invested ${fmtMoney(amt)} into ${c.name}`);
      }
      if (c.ticker || outsidePct(c) > 0) return fail(`Other owners share ${c.name}: take money out as dividends so they get their part`);
      const amt = Math.min(-cmd.amount, c.cash - (c.lockedCapital ?? 0));
      if (amt <= 0) return fail(c.lockedCapital ? `${c.name} must keep its ${fmtMoney(c.lockedCapital)} of bank capital` : 'No company cash');
      c.cash -= amt;
      w.player.cash += amt;
      return ok(`Withdrew ${fmtMoney(amt)}`);
    }
    case 'placeOrder': {
      const s = stockByTicker(w, cmd.ticker);
      if (!s) return fail('Unknown ticker');
      const qty = Math.floor(cmd.qty);
      if (qty <= 0) return fail('Enter a quantity');
      if (cmd.side === 'sell' && (w.player.holdings[s.ticker]?.shares ?? 0) < qty) return fail('You do not own that many shares');
      if (cmd.orderType === 'limit' && !(cmd.limit && cmd.limit > 0)) return fail('Enter a limit price');
      w.seq += 1;
      const o = {
        id: `o${w.seq}`, ownerId: 'player', ticker: s.ticker, side: cmd.side, type: cmd.orderType, qty, filled: 0,
        limit: cmd.orderType === 'limit' ? cmd.limit! : null, createdDay: w.day, status: 'open' as Order['status'], avgFill: 0, lastFillDay: -1, filledToday: 0,
      };
      w.orders.push(o);
      const filled = tryFill(w, o);
      if (o.status === 'filled') return ok(`${cmd.side === 'buy' ? 'Bought' : 'Sold'} ${filled.toLocaleString()} ${s.ticker} @ $${o.avgFill.toFixed(2)}`);
      if (filled > 0) return ok(`Filled ${filled.toLocaleString()} of ${qty.toLocaleString()} (liquidity limit ${maxFillToday(s).toLocaleString()}/day). Rest stays open.`);
      return ok(cmd.orderType === 'limit' ? 'Limit order placed' : 'Order queued: not enough cash or liquidity right now');
    }
    case 'cancelOrder': {
      const o = w.orders.find((x) => x.id === cmd.orderId && x.ownerId === 'player');
      if (!o || o.status !== 'open') return fail('Order not open');
      o.status = 'cancelled';
      return ok('Order cancelled');
    }
    case 'claimGoal':
      return claimGoal(w, cmd.goalId);
    case 'resolveEvent':
      return resolveEvent(w, cmd.eventId, cmd.choiceId);
    case 'setSisterDiscount': {
      const c = myCompany(w, cmd.companyId);
      if (!c) return fail('Company not found');
      c.sisterDiscount = clamp(cmd.discount, 0, 0.5);
      return ok(c.sisterDiscount > 0 ? `Your companies now get ${Math.round(c.sisterDiscount * 100)}% off` : 'Your companies now pay the full price');
    }
    case 'offerContract': {
      const c = myCompany(w, cmd.companyId);
      const partner = w.companies.find((x) => x.id === cmd.partnerId && !x.isPlayer && !x.bankrupt);
      if (!c || !partner) return fail('Company not found');
      return offerContract(w, c, partner, cmd.side, cmd.qtyPerDay, cmd.price, cmd.days);
    }
    case 'cancelContract':
      return cancelContract(w, cmd.contractId);
    case 'sellStake': {
      const c = myCompany(w, cmd.companyId);
      if (!c) return fail('Company not found');
      if (c.ticker) return fail('Listed company: its shares trade on the exchange');
      return sellStake(w, c, cmd.pct, cmd.buyerId);
    }
    case 'buyBackStake': {
      const c = myCompany(w, cmd.companyId);
      if (!c) return fail('Company not found');
      return buyBackStake(w, c, cmd.partnerId);
    }
    case 'buyStake': {
      const c = w.companies.find((x) => x.id === cmd.companyId && !x.isPlayer);
      if (!c) return fail('Company not found');
      return buyStake(w, c, cmd.pct);
    }
    case 'bidCompany': {
      const c = w.companies.find((x) => x.id === cmd.companyId && !x.isPlayer);
      if (!c) return fail('Company not found');
      return bidCompany(w, c, cmd.premium, cmd.mode);
    }
    case 'sellCompany': {
      const c = myCompany(w, cmd.companyId);
      if (!c) return fail('Company not found');
      return sellCompany(w, c, cmd.buyerId);
    }
    case 'chooseBank': {
      const c = myCompany(w, cmd.companyId);
      const b = w.companies.find((x) => x.id === cmd.bankId && isBank(x) && !x.bankrupt);
      if (!c || !b) return fail('Not found');
      if (!willLend(w, b, c)) return fail(`${b.name} will not lend to ${c.name}`);
      c.bankId = b.id;
      return ok(`${c.name} now borrows from ${b.name}`);
    }
    case 'buyLicence':
      return buyLicence(w, cmd.industry);
    case 'setLoanRate': {
      const c = myCompany(w, cmd.companyId);
      if (!c || !isBank(c)) return fail('Not one of your banks');
      c.loanRateMult = clamp(cmd.mult, MIN_RATE_MULT, MAX_RATE_MULT);
      return ok(`${c.name} now charges ${Math.round(c.loanRateMult * 100)}% of the usual loan margin`);
    }
    case 'seenLevel':
      w.play.levelSeen = w.player.level;
      return ok('');
    case 'seenReport':
      w.play.reportSeen = cmd.id;
      return ok('');
    case 'seenStreak':
      if (w.play.streak.reward) w.play.streak.reward.seen = true;
      return ok('');
    case 'seenCampaign': {
      const x = w.play.campaigns.find((y) => y.id === cmd.id);
      if (x) x.seen = true;
      return ok('');
    }
    case 'checkIn':
      return checkIn(w, cmd.date, netWorth(w), (xp) => addXp(w, xp));
    case 'acceptJob':
      return acceptJob(w, cmd.jobId, cmd.companyId);
    case 'startCampaign':
      return startCampaign(w, cmd.companyId, cmd.size, cmd.weeks);
    case 'buildWarehouse':
      return buildWarehouse(w);
    case 'upgradeWarehouse':
      return upgradeWarehouse(w, cmd.id);
    case 'setWarehouseLimit':
      return setLimit(w, cmd.id, cmd.good, cmd.share);
    case 'sendStock':
      return sendStock(w, cmd.id, cmd.good, cmd.qty, cmd.to);
    case 'releaseStock':
      return releaseStock(w, cmd.id, cmd.good, cmd.qty);
    case 'setBuyOrder':
      return setBuyOrder(w, cmd.warehouseId, cmd.good, cmd.perDay, cmd.maxPrice);
    case 'setSellRule':
      return setSellRule(w, cmd.id, cmd.good, cmd.above, cmd.shortage);
    case 'sellToRivals':
      return sellToRivals(w, cmd.id, cmd.good, cmd.qty);
    case 'tenderJoin':
      return joinTender(w, cmd.tenderId, cmd.companyId);
    case 'tenderBid':
      return bidInTender(w, cmd.tenderId, cmd.price);
    case 'tenderPass':
      return passTender(w, cmd.tenderId);
    case 'endWar':
      return endWar(w, cmd.warId);
    case 'setInsurance': {
      const c = myCompany(w, cmd.companyId);
      if (!c) return fail('Company not found');
      c.insured = cmd.on;
      return ok(cmd.on ? `${c.name} is insured: ${fmtMoney(premiumPerDay(c) * 365)} a year, pays ${Math.round(COVER * 100)}% of disaster and fire repairs` : `${c.name} is no longer insured`);
    }
    case 'explore': {
      const c = myCompany(w, cmd.companyId);
      if (!c) return fail('Company not found');
      return explore(w, c);
    }
    case 'bidAuction':
      return bidAuction(w, cmd.auctionId, cmd.amount);
    case 'answerInbox':
      return answerInbox(w, cmd.cardId, cmd.choiceId);
    case 'clearTips':
      return clearTips(w, cmd.ids);
    case 'postRequest':
      return postRequest(w, cmd);
    case 'acceptReply':
      return acceptReply(w, cmd.requestId, cmd.companyId);
    case 'cancelRequest':
      return cancelRequest(w, cmd.requestId);
    case 'saveBudget':
      return saveBudget(w);
    case 'hireExec':
      return hireExec(w, cmd.id);
    case 'fireExec':
      return fireExec(w, cmd.id);
    case 'raiseExec':
      return raiseExec(w, cmd.id);
    case 'exportGoods':
      return exportGoods(w, cmd.to, cmd.good, cmd.qty);
    case 'importGoods':
      return importGoods(w, cmd.from, cmd.good, cmd.qty);
    case 'acceptBarter':
      return acceptBarter(w, cmd.id);
    case 'openOffice':
      return openOffice(w, cmd.nation);
    case 'closeOffice':
      return closeOffice(w, cmd.nation);
    case 'hireResearcher':
      return hireResearcher(w, cmd.id, cmd.companyId);
    case 'fireResearcher':
      return fireResearcher(w, cmd.companyId, cmd.id);
    case 'startProject':
      return startProject(w, cmd.companyId, cmd.kind);
    case 'stopProject':
      return stopProject(w, cmd.companyId);
    case 'offerLicence':
      return offerLicence(w, cmd.patentId, cmd.companyId, cmd.fee);
    case 'acceptLicence':
      return acceptLicence(w, cmd.patentId, cmd.companyId);
    case 'clearBudget':
      delete w.play.budget;
      return ok('Plan cleared');
    case 'pitchPartner':
      return pitchPartner(w, cmd.good, cmd.partnerId, cmd.pct);
    case 'setMaintenance': {
      const c = myCompany(w, cmd.companyId);
      if (!c) return fail('Company not found');
      if (!MAINT[cmd.level]) return fail('Unknown level');
      c.maintenance = cmd.level;
      return ok(`Maintenance set to ${MAINT[cmd.level].label.toLowerCase()}`);
    }
    case 'setManager': {
      const c = myCompany(w, cmd.companyId);
      if (!c) return fail('Company not found');
      if (!MANAGERS[cmd.manager]) return fail('Unknown manager');
      c.manager = cmd.manager;
      return ok(cmd.manager === 'none' ? `You run ${c.name} yourself now` : `${MANAGERS[cmd.manager].label} hired for ${c.name}`);
    }
    case 'seenAchievement': {
      const a = w.achievements.find((x) => x.id === cmd.id);
      if (a) a.seen = true;
      return ok('');
    }
  }
}
