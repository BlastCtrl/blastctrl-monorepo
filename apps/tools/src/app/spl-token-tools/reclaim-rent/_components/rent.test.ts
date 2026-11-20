import { describe, expect, it } from "vitest";
import {
  RENT_STEPS,
  checkBackNote,
  currentStepIndex,
  isScheduled,
  nextDrop,
  remainingSteps,
  stepStatus,
  tokenAccountExcess,
  type RentStatus,
} from "./rent";

/** Mainnet in late November 2026: steps 1 and 2 live, nothing scheduled. */
const twoLive: RentStatus = {
  readAt: Date.UTC(2026, 10, 20, 8),
  lamportsPerByte: 5080,
  gates: [
    "active",
    "active",
    "not-scheduled",
    "not-scheduled",
    "not-scheduled",
  ],
};
const stepThreeScheduled: RentStatus = {
  ...twoLive,
  gates: ["active", "active", "scheduled", "not-scheduled", "not-scheduled"],
};
const gatesUnread: RentStatus = { ...twoLive, gates: null };
const allLive: RentStatus = {
  ...twoLive,
  lamportsPerByte: 696,
  gates: ["active", "active", "active", "active", "active"],
};

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

describe("RENT_STEPS", () => {
  it("is the original rate followed by the five reductions", () => {
    expect(RENT_STEPS.map((s) => s.lamportsPerByte)).toEqual([
      6960, 6333, 5080, 2575, 1322, 696,
    ]);
    expect(RENT_STEPS.map((s) => s.label)).toEqual([
      "Original",
      "Step 1",
      "Step 2",
      "Step 3",
      "Step 4",
      "Step 5",
    ]);
  });
});

describe("tokenAccountExcess", () => {
  it("is what an account opened at the original rent no longer needs", () => {
    expect(tokenAccountExcess(6960)).toBe(0);
    expect(tokenAccountExcess(5080)).toBe(2_039_280 - 1_488_440);
    expect(tokenAccountExcess(696)).toBe(1_835_352);
  });
});

describe("isScheduled", () => {
  it("reads each step's own gate, which the original rate doesn't have", () => {
    expect(isScheduled(stepThreeScheduled, 0)).toBe(false);
    expect(isScheduled(stepThreeScheduled, 2)).toBe(false);
    expect(isScheduled(stepThreeScheduled, 3)).toBe(true);
    expect(isScheduled(stepThreeScheduled, 4)).toBe(false);
    expect(isScheduled(gatesUnread, 3)).toBe(false);
  });
});

describe("nextDrop", () => {
  it("is scheduled when a remaining step's gate is", () => {
    expect(nextDrop(stepThreeScheduled)).toBe("scheduled");
  });

  it("says so when no remaining step is scheduled", () => {
    expect(nextDrop(twoLive)).toBe("unscheduled");
  });

  it("doesn't guess when the gates couldn't be read", () => {
    expect(nextDrop(gatesUnread)).toBe("unknown");
  });

  it("goes by the live rate, not by gates that lag behind it", () => {
    // The rate already says step 3; its gate still reads as scheduled.
    expect(nextDrop({ ...stepThreeScheduled, lamportsPerByte: 2575 })).toBe(
      "unscheduled",
    );
  });

  it("is over once the last step is live", () => {
    expect(nextDrop(allLive)).toBe("none");
    expect(nextDrop({ ...gatesUnread, lamportsPerByte: 696 })).toBe("none");
  });
});

describe("checkBackNote", () => {
  it("points to the next epoch when the next step is scheduled", () => {
    expect(checkBackNote(stepThreeScheduled)).toBe(
      "Rent drops again at the next epoch, so check back soon.",
    );
  });

  it("promises no date when there isn't one", () => {
    expect(checkBackNote(twoLive)).toBe(
      "Rent is set to drop again, but the next step isn't scheduled yet. Check back later.",
    );
    expect(checkBackNote(gatesUnread)).toBe(
      "Rent is set to drop again, so check back later.",
    );
  });

  it("says nothing after the last step, or before the status has loaded", () => {
    expect(checkBackNote(allLive)).toBe("");
    expect(checkBackNote(null)).toBe("");
  });
});
