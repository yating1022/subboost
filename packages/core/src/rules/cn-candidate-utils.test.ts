import { describe, expect, it } from "vitest";
import {
  buildCnRuleCandidatesFromSources,
  buildCnRuleVariantIds,
  buildLocalCnRuleCandidates,
  collectCnCandidateParents,
  normalizeRuleListLines,
  type CnRuleCandidateSource,
} from "./cn-candidate-utils";

describe("CN candidate utils", () => {
  it("builds stable CN variant ids from regular and negated parent ids", () => {
    expect(buildCnRuleVariantIds("")).toEqual([]);
    expect(buildCnRuleVariantIds("-!cn").map((item) => item.id)).toEqual([
      "-!cn-cn",
      "-!cn@cn",
      "-!cn-cn@cn",
    ]);
    expect(buildCnRuleVariantIds(" streaming ")).toEqual([
      { id: "streaming-cn", variantKind: "dash-cn" },
      { id: "streaming@cn", variantKind: "at-cn" },
      { id: "streaming-cn@cn", variantKind: "dash-cn-at-cn" },
    ]);
    expect(buildCnRuleVariantIds("streaming-!cn").map((item) => item.id)).toEqual([
      "streaming-!cn-cn",
      "streaming-!cn@cn",
      "streaming-!cn-cn@cn",
      "streaming-cn",
      "streaming@cn",
      "streaming-cn@cn",
    ]);
  });

  it("collects enabled parent rules and respects exclusions", () => {
    expect(collectCnCandidateParents([], { defaultToAll: false })).toEqual([]);
    expect(collectCnCandidateParents([" select ", " "])).toEqual([]);

    const parents = collectCnCandidateParents([], { defaultToAll: true });
    expect(parents.length).toBeGreaterThan(0);
    const first = parents[0];
    if (!first) throw new Error("Expected at least one parent");

    const excluded = collectCnCandidateParents([first.parentModuleId], {
      excludedRuleKeys: [`${first.parentModuleId}:${first.parentRuleId}`],
    });
    expect(excluded).not.toContainEqual(first);
  });

  it("normalizes rule list content before duplicate and coverage checks", () => {
    expect(normalizeRuleListLines([" DOMAIN,a.com ", "", "# comment", "DOMAIN,a.com", null as never])).toEqual([
      "DOMAIN,a.com",
    ]);

    const sources: CnRuleCandidateSource[] = [
      {
        id: " alpha-cn ",
        variantKind: "dash-cn",
        parentModuleId: "media",
        parentRuleId: "alpha",
        lines: ["DOMAIN,a.com", "DOMAIN,a.com"],
      },
      {
        id: "alpha@cn",
        variantKind: "at-cn",
        parentModuleId: "media",
        parentRuleId: "alpha",
        lines: ["DOMAIN,a.com"],
      },
      {
        id: "geo-cn",
        variantKind: "dash-cn",
        parentModuleId: "media",
        parentRuleId: "geo",
        lines: ["DOMAIN,geo.example"],
      },
      {
        id: "empty-cn",
        variantKind: "dash-cn",
        parentModuleId: "media",
        parentRuleId: "empty",
        lines: ["", "# comment"],
      },
      {
        id: " ",
        variantKind: "dash-cn",
        parentModuleId: "media",
        parentRuleId: "skip",
        lines: ["DOMAIN,skip.example"],
      },
    ];

    const candidates = buildCnRuleCandidatesFromSources(sources, ["DOMAIN,geo.example"]);
    const alpha = candidates.find((candidate) => candidate.id === "alpha-cn");
    const alphaDuplicate = candidates.find((candidate) => candidate.id === "alpha@cn");
    const geo = candidates.find((candidate) => candidate.id === "geo-cn");
    const empty = candidates.find((candidate) => candidate.id === "empty-cn");

    expect(candidates.map((candidate) => candidate.id)).toEqual(["alpha-cn", "alpha@cn", "empty-cn", "geo-cn"]);
    expect(alpha).toMatchObject({ canonicalId: "alpha-cn", actionable: true });
    expect(alphaDuplicate).toMatchObject({ canonicalId: "alpha-cn", duplicateOf: "alpha-cn", actionable: false });
    expect(geo).toMatchObject({ coveredByGeolocationCn: true, actionable: false });
    expect(empty).toMatchObject({ empty: true, actionable: false });
  });

  it("uses variant priority and lexical order when duplicate signatures compete", () => {
    const candidates = buildCnRuleCandidatesFromSources(
      [
        {
          id: "z-cn-b",
          variantKind: "dash-cn",
          parentModuleId: "z-module",
          parentRuleId: "z-parent",
          lines: ["DOMAIN,z.example"],
        },
        {
          id: "z-cn-a",
          variantKind: "dash-cn",
          parentModuleId: "z-module",
          parentRuleId: "z-parent",
          lines: ["DOMAIN,z.example"],
        },
        {
          id: "z@cn",
          variantKind: "at-cn",
          parentModuleId: "z-module",
          parentRuleId: "z-parent",
          lines: ["DOMAIN,z.example"],
        },
        {
          id: "a-cn",
          variantKind: "dash-cn",
          parentModuleId: "a-module",
          parentRuleId: "a-parent",
          lines: ["DOMAIN,a.example"],
        },
        {
          id: "b-cn",
          variantKind: "dash-cn",
          parentModuleId: "a-module",
          parentRuleId: "b-parent",
          lines: ["DOMAIN,b.example"],
        },
      ],
      [" ", "# comment"]
    );

    expect(candidates.map((candidate) => candidate.id)).toEqual(["a-cn", "b-cn", "z-cn-a", "z-cn-b", "z@cn"]);
    expect(candidates.find((candidate) => candidate.id === "z-cn-a")).toMatchObject({
      canonicalId: "z-cn-a",
      actionable: true,
    });
    expect(candidates.find((candidate) => candidate.id === "z-cn-b")).toMatchObject({
      canonicalId: "z-cn-a",
      duplicateOf: "z-cn-a",
      actionable: false,
    });
    expect(candidates.find((candidate) => candidate.id === "z@cn")).toMatchObject({
      canonicalId: "z-cn-a",
      duplicateOf: "z-cn-a",
      actionable: false,
    });
  });

  it("builds local candidates from the bundled rule database", () => {
    const parents = collectCnCandidateParents([], { defaultToAll: true });
    const first = parents[0];
    if (!first) throw new Error("Expected at least one parent");

    const candidates = buildLocalCnRuleCandidates({
      moduleIds: [first.parentModuleId],
      excludedRuleKeys: [`${first.parentModuleId}:__missing__`],
    });

    expect(Array.isArray(candidates)).toBe(true);
    for (const candidate of candidates) {
      expect(candidate).toMatchObject({
        behavior: "domain",
        format: "mrs",
        coveredByGeolocationCn: false,
        empty: false,
        actionable: true,
      });
      expect(candidate.path).toBe(`geosite/${candidate.id}.mrs`);
    }

    const excluded = buildLocalCnRuleCandidates({
      moduleIds: [first.parentModuleId],
      excludedRuleKeys: [`${first.parentModuleId}:${first.parentRuleId}`],
    });
    expect(excluded.every((candidate) => candidate.parentRuleId !== first.parentRuleId)).toBe(true);

    expect(buildLocalCnRuleCandidates({ moduleIds: ["google"] })).toContainEqual(
      expect.objectContaining({
        id: "google-cn",
        name: "google-cn（谷歌中国）",
        parentRuleId: "google",
        parentModuleId: "google",
      })
    );
    expect(buildLocalCnRuleCandidates({ moduleIds: ["google", "apple"] }).map((candidate) => candidate.id)).toEqual([
      "apple-cn",
      "google-cn",
    ]);
  });
});
