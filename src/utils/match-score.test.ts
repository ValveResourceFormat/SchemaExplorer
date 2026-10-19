import { describe, expect, it } from "vitest";
import {
  combineMatches,
  longestWordLength,
  matchTypoWords,
  nameMatchTier,
  scoreName,
  shortestTypoTarget,
  TIER_EXACT,
  TIER_FUZZY,
  TIER_PREFIX,
  TIER_SUBSTRING,
  TIER_WORD_START,
  typoMatch,
  WHOLE_WORD_PENALTY,
} from "./match-score";

function score(pattern: string, name: string, fuzzy = true) {
  return scoreName(pattern, name, name.toLowerCase(), fuzzy);
}

describe("scoreName tiers", () => {
  it("rates exact, prefix, word start, mid-word and fuzzy", () => {
    expect(score("cbaseentity", "CBaseEntity")?.tier).toBe(TIER_EXACT);
    expect(score("cbase", "CBaseEntity")?.tier).toBe(TIER_PREFIX);
    expect(score("entity", "CBaseEntity")?.tier).toBe(TIER_WORD_START);
    expect(score("seent", "CBaseEntity")?.tier).toBe(TIER_SUBSTRING);
    expect(score("cbe", "CBaseEntity")?.tier).toBe(TIER_FUZZY);
    expect(score("xyz", "CBaseEntity")).toBeNull();
  });

  it("prefers an occurrence at a word start over an earlier one in a word", () => {
    // "pawn" is inside SPAWN first and starts the word Pawn after it
    const match = score("pawn", "SPAWN_Pawn");
    expect(match?.tier).toBe(TIER_WORD_START);
    expect(match?.ranges).toEqual([6, 10]);
  });

  it("ranks a word start above the middle of a word", () => {
    const wordStart = score("pawn", "CCSPlayerPawn")!;
    const midWord = score("pawn", "SPAWNGROUP_HEADER")!;
    expect(wordStart.tier).toBeLessThan(midWord.tier);
  });

  it("prefers shorter names and earlier positions within a tier", () => {
    expect(score("base", "Base_X")!.score).toBeLessThan(score("base", "Base_Xyz")!.score);
    expect(score("x", "A_X")!.score).toBeLessThan(score("x", "AB_X")!.score);
  });

  it("puts a shorter name before an earlier position in a longer one", () => {
    const short = score("pawn", "CCSPlayerPawn")!;
    const long = score("pawn", "CCS2PawnGraphController")!;
    expect(short.tier).toBe(long.tier);
    expect(short.score).toBeLessThan(long.score);
  });

  it("starts words after underscores, dashes and ::", () => {
    expect(score("widget", "Ns::Widget")?.tier).toBe(TIER_WORD_START);
    expect(score("widget", "ns_widget")?.tier).toBe(TIER_WORD_START);
    expect(score("widget", "ns-widget")?.tier).toBe(TIER_WORD_START);
    expect(score("widget", "nswidget")?.tier).toBe(TIER_SUBSTRING);
  });

  it("starts words at an acronym end and at letter and digit changes", () => {
    expect(score("weapon", "CCSWeapon")?.tier).toBe(TIER_WORD_START);
    expect(score("3d", "sky3dparams")?.tier).toBe(TIER_WORD_START);
    expect(score("dparams", "sky3dparams")?.tier).toBe(TIER_WORD_START);
    expect(score("params", "sky3dparams")?.tier).toBe(TIER_SUBSTRING);
  });

  it("only matches fuzzily with three letters and when asked to", () => {
    expect(score("cb", "CxBx")).toBeNull();
    expect(score("cbe", "CBxEntity")?.tier).toBe(TIER_FUZZY);
    expect(score("cbe", "CBxEntity", false)).toBeNull();
  });
});

describe("scoreName ranges", () => {
  it("gives the range of a substring", () => {
    expect(score("entity", "CBaseEntity")?.ranges).toEqual([5, 11]);
    expect(score("cbaseentity", "CBaseEntity")?.ranges).toEqual([0, 11]);
  });

  it("gives the matched letters of a fuzzy match, next ones together", () => {
    // The first-letter scan wins: C, then S and P
    expect(score("cspp", "CCSPlayerPawn")?.ranges).toEqual([0, 1, 2, 4, 9, 10]);
  });

  it("gives the word starts when the boundary scan wins", () => {
    const match = score("cbe", "CBaseEntity")!;
    expect(match.tier).toBe(TIER_FUZZY);
    expect(match.ranges).toEqual([0, 2, 5, 6]);
  });
});

describe("fuzzy matches", () => {
  it("need the first letter to start a word", () => {
    expect(score("cet", "CBaseEntity")?.tier).toBe(TIER_FUZZY);
    expect(score("aet", "CBaseEntity")).toBeNull();
  });

  it("need the letters to fit in about twice the pattern", () => {
    expect(score("abc", "AxBxC")?.tier).toBe(TIER_FUZZY);
    expect(score("abc", "AxxxxxxxxxxxBxxxxxxxxC")).toBeNull();
  });

  it("find the nearest letters when the first start is too wide", () => {
    const match = score("abc", "AxxxxxxxxxxxxxxxxxAxBxC");
    expect(match?.ranges).toEqual([18, 19, 20, 21, 22, 23]);
  });

  it("are not tried for a pattern ending in an underscore", () => {
    expect(score("cbe", "CBase_Entity")?.tier).toBe(TIER_FUZZY);
    expect(score("cbe_", "CBase_Entity")).toBeNull();
    expect(score("cb_", "CxBx_Entity")).toBeNull();
  });
});

describe("snake_case patterns", () => {
  it("match a name without its underscores", () => {
    expect(score("mana_regen", "ManaRegen")?.tier).toBe(TIER_EXACT);
    const field = score("mana_regen", "m_flManaRegen");
    expect(field?.tier).toBe(TIER_WORD_START);
    expect(field?.ranges).toEqual([4, 13]);
  });

  it("map the ranges back around the underscores of the name", () => {
    const match = score("ab_c", "a_b_c");
    expect(match?.tier).toBe(TIER_EXACT);
    expect(match?.ranges).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("match from the start of a word only", () => {
    expect(score("ana_regen", "ManaRegen", false)).toBeNull();
    expect(score("mana_reg", "m_flManaRegen")?.tier).toBe(TIER_WORD_START);
  });

  it("are not collapsed when the pattern starts or ends with an underscore", () => {
    expect(score("mana_", "ManaRegen", false)).toBeNull();
    expect(score("_regen", "ManaRegen", false)).toBeNull();
  });

  it("still match as they are first", () => {
    expect(score("mana_regen", "mana_regen")?.tier).toBe(TIER_EXACT);
    expect(score("mana_regen", "x_mana_regen_y")?.ranges).toEqual([2, 12]);
  });
});

describe("short patterns", () => {
  it("do not match inside a word at two letters or fewer", () => {
    expect(score("ab", "xxabxx", false)).toBeNull();
    expect(score("a", "xxaxx", false)).toBeNull();
    expect(score("ab", "xx_abxx", false)?.tier).toBe(TIER_WORD_START);
    expect(score("ab", "abxx", false)?.tier).toBe(TIER_PREFIX);
    expect(score("abc", "xxabcxx", false)?.tier).toBe(TIER_SUBSTRING);
  });

  it("do not match inside a word when they end in an underscore", () => {
    expect(score("mp_", "skipmp_x", false)).toBeNull();
    expect(score("mp_", "skip_mp_x", false)?.tier).toBe(TIER_WORD_START);
    expect(score("mp_", "mp_x", false)?.tier).toBe(TIER_PREFIX);
  });
});

describe("whole words", () => {
  it("sort before a match that cuts into the next word", () => {
    const whole = score("mana", "ManaDrain")!;
    const cut = score("mana", "Manager")!;
    expect(whole.tier).toBe(cut.tier);
    expect(whole.score).toBeLessThan(cut.score);
  });

  it("count an end at an underscore, a digit or the end of the name", () => {
    expect(score("ward", "Ward_X")!.score).toBeLessThan(WHOLE_WORD_PENALTY);
    expect(score("ward", "Ward2")!.score).toBeLessThan(WHOLE_WORD_PENALTY);
    expect(score("ward", "XWard")!.score).toBeLessThan(WHOLE_WORD_PENALTY);
    expect(score("ward", "Warden")!.score).toBeGreaterThanOrEqual(WHOLE_WORD_PENALTY);
  });

  it("prefer an occurrence that ends a word to an earlier one that does not", () => {
    const match = score("ward", "WardenWard");
    expect(match?.ranges).toEqual([6, 10]);
    expect(match!.score).toBeLessThan(WHOLE_WORD_PENALTY);
  });

  it("make nameMatchTier ignore cut words when asked", () => {
    expect(nameMatchTier(["Manager"], ["mana"])).toBe(TIER_PREFIX);
    expect(nameMatchTier(["Manager"], ["mana"], true)).toBe(5);
    expect(nameMatchTier(["ManaDrain"], ["mana"], true)).toBe(TIER_PREFIX);
  });
});

describe("typoMatch", () => {
  function typo(pattern: string, name: string) {
    return typoMatch(pattern, name, name.toLowerCase());
  }

  it("finds a word one swap, edit or letter away", () => {
    expect(typo("healht", "m_iHealth")?.ranges).toEqual([3, 9]);
    expect(typo("armour", "armor")?.ranges).toEqual([0, 5]);
    expect(typo("cooldwon", "m_fCooldown")?.ranges).toEqual([3, 11]);
    expect(typo("heakth", "Health")?.ranges).toEqual([0, 6]);
    expect(typo("helth", "Health")?.ranges).toEqual([0, 6]);
    expect(typo("heallth", "Health")?.ranges).toEqual([0, 6]);
  });

  it("finds the start of a longer word", () => {
    expect(typo("healht", "CItem_Healthshot")?.ranges).toEqual([6, 12]);
  });

  it("finds nothing two edits away", () => {
    expect(typo("heqqth", "Health")).toBeNull();
    expect(typo("hlaeth", "Health")).toBeNull();
  });

  it("finds nothing for a pattern under four letters", () => {
    expect(typo("hea", "Health")).toBeNull();
    expect(typo("hel", "Health")).toBeNull();
  });

  it("scores below zero, shorter names first", () => {
    expect(typo("healht", "Health")!.score).toBeLessThan(0);
    expect(typo("healht", "Health")!.score).toBeLessThan(typo("healht", "HealthX")!.score);
    expect(typo("healht", "Health")!.tier).toBe(TIER_FUZZY);
  });
});

describe("typo word lengths", () => {
  it("measures the longest word the way typoMatch splits names", () => {
    expect(longestWordLength("CBaseEntity")).toBe(6);
    expect(longestWordLength("m_flHealthMax")).toBe(6);
    expect(longestWordLength("m_hOwner2")).toBe(5);
    expect(longestWordLength("__")).toBe(0);
    expect(longestWordLength("")).toBe(0);
  });

  it("needs a word one letter shorter than the shortest word looked for", () => {
    expect(shortestTypoTarget(["healht"])).toBe(5);
    expect(shortestTypoTarget(["healht", "armo"])).toBe(3);
    expect(shortestTypoTarget(["hea", "ab"])).toBe(0);
    expect(shortestTypoTarget([])).toBe(0);
  });

  it("is never more than the longest word of a name a typo is found in", () => {
    const patterns = ["healht", "armour", "heallth", "helth", "cooldwon", "heqqth"];
    const names = ["Health", "m_iHealth", "armor", "m_fCooldown", "CItem_Healthshot", "ab_cd"];
    for (const pattern of patterns) {
      for (const name of names) {
        if (typoMatch(pattern, name, name.toLowerCase()) === null) continue;
        expect(longestWordLength(name)).toBeGreaterThanOrEqual(shortestTypoTarget([pattern]));
      }
    }
  });
});

describe("matchTypoWords", () => {
  function match(words: string[], name: string) {
    const target = { name, lower: name.toLowerCase() };
    return matchTypoWords(
      words,
      target,
      (word, t) => scoreName(word, t.name, t.lower, false),
      (word, t) => typoMatch(word, t.name, t.lower),
    );
  }

  it("lists a match per word, the typos among them", () => {
    const matches = match(["sv", "gravtiy"], "sv_gravity");
    expect(matches?.map((m) => m.ranges)).toEqual([
      [0, 2],
      [3, 10],
    ]);
    expect(matches?.[1].tier).toBe(TIER_FUZZY);
  });

  it("finds nothing without a typo, or when a word is not in the name", () => {
    expect(match(["sv", "gravity"], "sv_gravity")).toBeNull();
    expect(match(["sv", "gravtiy"], "cl_gravity")).toBeNull();
  });
});

describe("combineMatches", () => {
  it("takes the worst tier and sums the scores", () => {
    const matches = [
      { tier: TIER_PREFIX, score: 3 },
      { tier: TIER_WORD_START, score: 4 },
    ];
    expect(combineMatches(matches)).toEqual({ tier: TIER_WORD_START, score: 7 });
    expect(combineMatches([])).toEqual({ tier: TIER_EXACT, score: 0 });
  });
});

describe("nameMatchTier", () => {
  it("is TIER_NONE for a word that is in no name", () => {
    expect(nameMatchTier(["CLogicRelay"], ["health"])).toBe(5);
  });
});
