import { activeElapsedSeconds } from "../data/repository.js";

export class TimerController {
  constructor(repository, onTick) {
    this.repository = repository;
    this.onTick = onTick;
    this.interval = null;
  }

  start() {
    if (this.interval) return;
    this.renderNow();
    this.interval = globalThis.setInterval(() => this.renderNow(), 500);
  }

  renderNow() {
    const timer = this.repository.getState()?.activeTimer;
    this.onTick({ timer, elapsedSeconds: activeElapsedSeconds(timer) });
  }

  stop() {
    if (this.interval) globalThis.clearInterval(this.interval);
    this.interval = null;
  }
}
