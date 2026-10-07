import { describe, expect, it } from "vitest";

import { getMosaicGrid, selectMosaicTileIndex } from "@/lib/mosaic";

describe("deterministic mosaic rules", () => {
  it("normalizes the target while preserving aspect ratio and minimum grid size", () => {
    expect(getMosaicGrid(2400, 1200, 12, { maxWidth: 1600, columns: 10 })).toEqual({ width: 1600, height: 800, columns: 10, rows: 5 });
  });

  it("rejects unusable targets or empty tile sets", () => {
    expect(() => getMosaicGrid(0, 1200, 12)).toThrow("usable dimensions");
    expect(() => getMosaicGrid(1200, 800, 0)).toThrow("one photograph");
  });

  it("selects the same tile for the same cell and seed", () => {
    const first = selectMosaicTileIndex(4, 7, 12, 42);
    expect(first).toBe(selectMosaicTileIndex(4, 7, 12, 42));
    expect(first).toBeGreaterThanOrEqual(0);
    expect(first).toBeLessThan(12);
  });
});
