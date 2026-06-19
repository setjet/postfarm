import type { ContentPlan, ContentPlanSlot } from '../types';

export type PlannerJobStage = 'generation' | 'scheduling';

export interface PlannerJobSummary {
  ready: number;
  warnings: number;
  failed: number;
}

export interface PlannerJobState {
  status: 'idle' | 'running' | 'complete';
  stage: PlannerJobStage | null;
  planId: string | null;
  planName: string | null;
  done: number;
  total: number;
  failed: number;
  activeSlotIds: string[];
  plan: ContentPlan | null;
  summary: PlannerJobSummary | null;
}

interface PlannerJobDependencies {
  generateSlot: (planId: string, slotId: string) => Promise<ContentPlan>;
  getPlan: (planId: string) => Promise<ContentPlan>;
  renderSlot: (slot: ContentPlanSlot) => Promise<string[] | undefined>;
  scheduleSlot: (plan: ContentPlan, slot: ContentPlanSlot, slides: string[] | undefined) => Promise<ContentPlan>;
}

const idleState: PlannerJobState = {
  status: 'idle', stage: null, planId: null, planName: null, done: 0, total: 0,
  failed: 0, activeSlotIds: [], plan: null, summary: null,
};

export function summarizePlannerJob(plan: ContentPlan): PlannerJobSummary {
  return plan.slots.reduce((summary, slot) => {
    if (slot.status === 'failed') summary.failed++;
    else if (slot.status === 'needs_attention' || slot.qualityReport?.status === 'warnings' || slot.qualityReport?.status === 'blocked') summary.warnings++;
    else if (['ready_for_review', 'approved', 'scheduled'].includes(slot.status)) summary.ready++;
    return summary;
  }, { ready: 0, warnings: 0, failed: 0 });
}

export class PlannerJobController {
  private state: PlannerJobState = idleState;
  private listeners = new Set<() => void>();
  private activePromise: Promise<ContentPlan> | null = null;
  private readonly dependencies: PlannerJobDependencies;

  constructor(dependencies: PlannerJobDependencies) {
    this.dependencies = dependencies;
  }

  getSnapshot = () => this.state;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  startGeneration = (plan: ContentPlan, slots: ContentPlanSlot[]) =>
    this.start('generation', plan, slots);

  startScheduling = (plan: ContentPlan, slots: ContentPlanSlot[]) =>
    this.start('scheduling', plan, slots);

  private publish(next: PlannerJobState) {
    this.state = next;
    this.listeners.forEach((listener) => {
      try { listener(); } catch { /* A closed view cannot interrupt the job. */ }
    });
  }

  private start(stage: PlannerJobStage, plan: ContentPlan, slots: ContentPlanSlot[]) {
    if (this.activePromise) return this.activePromise;
    const run = this.run(stage, plan, slots);
    this.activePromise = run;
    const clear = () => {
      if (this.activePromise === run) this.activePromise = null;
    };
    void run.then(clear, clear);
    return run;
  }

  private async run(stage: PlannerJobStage, source: ContentPlan, slots: ContentPlanSlot[]) {
    let current = source;
    let failed = 0;
    this.publish({
      status: 'running', stage, planId: source.id, planName: source.name, done: 0,
      total: slots.length, failed: 0, activeSlotIds: [], plan: source, summary: null,
    });

    for (let index = 0; index < slots.length; index++) {
      const slot = slots[index];
      this.publish({ ...this.state, activeSlotIds: [slot.id], plan: current });
      try {
        current = stage === 'generation'
          ? await this.dependencies.generateSlot(current.id, slot.id)
          : await this.dependencies.scheduleSlot(current, slot, await this.dependencies.renderSlot(slot));
        if (current.slots.find((item) => item.id === slot.id)?.status === 'failed') failed++;
      } catch {
        failed++;
        try { current = await this.dependencies.getPlan(current.id); } catch { /* Continue the remaining slots. */ }
      }
      this.publish({
        ...this.state,
        done: index + 1,
        failed,
        activeSlotIds: [],
        plan: current,
      });
    }

    this.publish({
      ...this.state,
      status: 'complete',
      activeSlotIds: [],
      plan: current,
      summary: summarizePlannerJob(current),
    });
    return current;
  }
}
