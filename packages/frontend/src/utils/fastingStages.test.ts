import { describe, it, expect } from 'vitest';
import { getFastingStage, FASTING_STAGES } from './fastingStages';

describe('Fasting Biological Stage Progression', () => {
  it('identifies Stage 1 (Fed State) at 2 hours', () => {
    const res = getFastingStage(2);
    expect(res.currentStage.id).toBe(1);
    expect(res.currentStage.name).toContain('Fed');
    expect(res.nextStage?.id).toBe(2);
    expect(res.hoursToNextStage).toBe(2);
  });

  it('identifies Stage 4 (The Metabolic Switch) at 14 hours', () => {
    const res = getFastingStage(14);
    expect(res.currentStage.id).toBe(4);
    expect(res.currentStage.name).toContain('Metabolic Switch');
    expect(res.nextStage?.id).toBe(5);
    expect(res.hoursToNextStage).toBe(2); // 16 - 14
  });

  it('identifies Stage 5 (Deep Ketosis & Autophagy) at 20 hours', () => {
    const res = getFastingStage(20);
    expect(res.currentStage.id).toBe(5);
    expect(res.currentStage.name).toContain('Autophagy');
    expect(res.nextStage?.id).toBe(6);
  });

  it('identifies Stage 6 (Peak Autophagy & HGH Surge) at 36 hours', () => {
    const res = getFastingStage(36);
    expect(res.currentStage.id).toBe(6);
    expect(res.currentStage.name).toContain('HGH Surge');
  });

  it('identifies Stage 7 (Stem Cell & Immune Reset) at 52 hours and 72+ hours', () => {
    const res52 = getFastingStage(52);
    expect(res52.currentStage.id).toBe(7);
    expect(res52.currentStage.name).toContain('Stem Cell');

    const res80 = getFastingStage(80);
    expect(res80.currentStage.id).toBe(7);
    expect(res80.nextStage).toBeNull();
  });
});
