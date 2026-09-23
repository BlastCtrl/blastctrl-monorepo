import { describe, expect, it } from "vitest";
import { currentStepIndex, remainingSteps, stepStatus } from "./rent";

describe("currentStepIndex", () => {
  it("matches each step's exact rate", () => {
    expect(currentStepIndex(6960)).toBe(0);
    expect(currentStepIndex(6333)).toBe(1);
    expect(currentStepIndex(5080)).toBe(2);
    expect(currentStepIndex(696)).toBe(5);
  });

  it("handles rates between steps and beyond the table", () => {
    expect(currentStepIndex(6000)).toBe(1);
    expect(currentStepIndex(9000)).toBe(0);
    expect(currentStepIndex(100)).toBe(5);
  });
});

describe("stepStatus and remainingSteps", () => {
  it("marks earlier steps past and later ones upcoming", () => {
    expect(stepStatus(1, 5080)).toBe("past");
    expect(stepStatus(2, 5080)).toBe("current");
    expect(stepStatus(3, 5080)).toBe("upcoming");
    expect(remainingSteps(5080)).toBe(3);
    expect(remainingSteps(696)).toBe(0);
  });
});
