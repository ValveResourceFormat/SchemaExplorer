import { describe, it, expect } from "vitest";
import { dumpFileUrl } from "./games-list";

describe("dumpFileUrl", () => {
  it("points into the game's GameTracking repository", () => {
    expect(dumpFileUrl("cs2", "convars.txt")).toBe(
      "https://github.com/SteamTracking/GameTracking-CS2/blob/master/DumpSource2/convars.txt",
    );
  });

  it("returns null for unknown games", () => {
    expect(dumpFileUrl("hl3", "convars.txt")).toBeNull();
  });
});
