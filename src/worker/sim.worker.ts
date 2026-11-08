/// <reference lib="webworker" />
import { applyCommand, createWorld, step, updateProgress } from '../engine';
import type { WorldState } from '../engine/types';
import { SPEED_MS, type FromWorker, type Speed, type ToWorker } from './protocol';

let world: WorldState | null = null;
let speed: Speed = 0;
let timer: ReturnType<typeof setTimeout> | null = null;

const post = (m: FromWorker) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(m);

function publish() {
  if (world) post({ type: 'state', world });
}

function schedule() {
  if (timer) clearTimeout(timer);
  timer = null;
  if (!world || speed === 0) return;
  timer = setTimeout(() => {
    try {
      step(world!);
      publish();
    } catch (e) {
      post({ type: 'error', message: String(e) });
      speed = 0;
    }
    schedule();
  }, SPEED_MS[speed]);
}

self.onmessage = (ev: MessageEvent<ToWorker>) => {
  const msg = ev.data;
  switch (msg.type) {
    case 'new':
      world = createWorld(msg.seed, msg.scenario, msg.setup);
      publish();
      schedule();
      break;
    case 'load':
      world = msg.world;
      publish();
      schedule();
      break;
    case 'speed':
      speed = msg.speed;
      schedule();
      break;
    case 'command': {
      if (!world) return;
      const result = applyCommand(world, msg.cmd);
      if (msg.cmd.type !== 'seenAchievement') updateProgress(world);
      post({ type: 'result', id: msg.id, result });
      publish();
      break;
    }
    case 'snapshot':
      if (world) post({ type: 'snapshot', id: msg.id, world });
      break;
  }
};
