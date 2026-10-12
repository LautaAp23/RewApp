import { describe, expect, it } from "vitest";
import { slideProgress, slideReachedEnd } from "./slide-progress";

describe("payment slide", () => {
  it("tracks the finger and clamps movement to the available rail", () => {
    expect(slideProgress(90, 300)).toBe(.3);
    expect(slideProgress(-20, 300)).toBe(0);
    expect(slideProgress(450, 300)).toBe(1);
    expect(slideProgress(30, 0)).toBe(0);
  });
  it("does not authorize an incomplete drag", () => {
    expect(slideReachedEnd(slideProgress(150, 300))).toBe(false);
    expect(slideReachedEnd(slideProgress(287, 300))).toBe(false);
    expect(slideReachedEnd(slideProgress(288, 300))).toBe(true);
    expect(slideReachedEnd(slideProgress(300, 300))).toBe(true);
  });
});
