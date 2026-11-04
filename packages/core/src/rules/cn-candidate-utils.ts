import { PROXY_GROUP_MODULES } from "@subboost/core/generator/proxy-group-modules";
import { ALL_RULES } from "@subboost/core/rules-database";

export type CnRuleVariantKind = "dash-cn" | "at-cn" | "dash-cn-at-cn";

export interface CnCandidateParent {
  parentRuleId: string;
  parentModuleId: string;
}

export interface CnRuleCandidateSource extends CnCandidateParent {
  id: string;
  variantKind: CnRuleVariantKind;
  lines: Iterable<string>;
}

export interface CnRuleCandidate {
  id: string;
  name: string;
  behavior: "domain";
  format: "mrs";
  path: string;
  parentRuleId: string;
  parentModuleId: string;
  variantKind: CnRuleVariantKind;
  canonicalId: string;
  duplicateOf?: string;
  coveredByGeolocationCn: boolean;
  empty: boolean;
  actionable: boolean;
}

const VARIANT_PRIORITY: Record<CnRuleVariantKind, number> = {
  "dash-cn": 0,
  "at-cn": 1,
  "dash-cn-at-cn": 2,
};

const GEOSITE_PATH_PREFIX = "geosite/";

function addVariant(
  variants: Array<{ id: string; variantKind: CnRuleVariantKind }>,
  seen: Set<string>,
  id: string,
  variantKind: CnRuleVariantKind
) {
  const normalized = id.trim();
  if (!normalized || seen.has(normalized)) return;
  seen.add(normalized);
  variants.push({ id: normalized, variantKind });
}

function addVariantsForBase(
  variants: Array<{ id: string; variantKind: CnRuleVariantKind }>,
  seen: Set<string>,
  baseId: string
) {
  addVariant(variants, seen, `${baseId}-cn`, "dash-cn");
  addVariant(variants, seen, `${baseId}@cn`, "at-cn");
  addVariant(variants, seen, `${baseId}-cn@cn`, "dash-cn-at-cn");
}

export function buildCnRuleVariantIds(parentRuleId: string): Array<{ id: string; variantKind: CnRuleVariantKind }> {
  const id = parentRuleId.trim();
  if (!id) return [];

  const variants: Array<{ id: string; variantKind: CnRuleVariantKind }> = [];
  const seen = new Set<string>();
  addVariantsForBase(variants, seen, id);

  if (id.endsWith("-!cn")) {
    const baseId = id.slice(0, -"!cn".length).replace(/-$/, "");
    if (baseId && baseId !== id) addVariantsForBase(variants, seen, baseId);
  }

  return variants;
}

function normalizeModuleId(value: string): string {
  return value.trim();
}

function isDomainGeositeRule(rule: { behavior: string; path: string }): boolean {
  return rule.behavior === "domain" && rule.path.startsWith(GEOSITE_PATH_PREFIX);
}

export function collectCnCandidateParents(
  moduleIds: string[],
  options?: { excludedRuleKeys?: Iterable<string>; defaultToAll?: boolean }
): CnCandidateParent[] {
  const requested = moduleIds.map(normalizeModuleId).filter(Boolean);
  const enabledIds =
    requested.length > 0 || !options?.defaultToAll
      ? requested
      : PROXY_GROUP_MODULES.map((proxyModule) => proxyModule.id);
  const enabled = new Set(enabledIds);
  const excluded = new Set(
    Array.from(options?.excludedRuleKeys || [])
      .map((key) => key.trim())
      .filter(Boolean)
  );
  const out: CnCandidateParent[] = [];
  const seen = new Set<string>();

  for (const proxyModule of PROXY_GROUP_MODULES) {
    if (!enabled.has(proxyModule.id)) continue;
    if (proxyModule.category === "core") continue;

    for (const rule of proxyModule.rules) {
      if (!rule?.id || !isDomainGeositeRule(rule)) continue;
      const key = `${proxyModule.id}:${rule.id}`;
      if (excluded.has(key) || seen.has(key)) continue;
      seen.add(key);
      out.push({ parentModuleId: proxyModule.id, parentRuleId: rule.id });
    }
  }

  return out;
}

function formatLocalRuleName(rule: { id: string; name: string; nameZh: string }): string {
  const name = rule.name.trim() || rule.id;
  const nameZh = rule.nameZh.trim();
  return nameZh && nameZh !== name ? `${name}（${nameZh}）` : name;
}

export function buildLocalCnRuleCandidates(options: {
  moduleIds: string[];
  excludedRuleKeys?: string[];
}): CnRuleCandidate[] {
  const rulesById = new Map(ALL_RULES.filter((rule) => rule.behavior === "domain").map((rule) => [rule.id, rule]));
  const parents = collectCnCandidateParents(options.moduleIds, {
    excludedRuleKeys: options.excludedRuleKeys,
    defaultToAll: true,
  });
  const out: CnRuleCandidate[] = [];
  const seen = new Set<string>();

  for (const parent of parents) {
    for (const variant of buildCnRuleVariantIds(parent.parentRuleId)) {
      const rule = rulesById.get(variant.id);
      if (!rule) continue;
      const key = `${parent.parentModuleId}:${parent.parentRuleId}:${variant.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        id: variant.id,
        name: formatLocalRuleName(rule),
        behavior: "domain",
        format: "mrs",
        path: `${GEOSITE_PATH_PREFIX}${variant.id}.mrs`,
        parentRuleId: parent.parentRuleId,
        parentModuleId: parent.parentModuleId,
        variantKind: variant.variantKind,
        canonicalId: variant.id,
        coveredByGeolocationCn: false,
        empty: false,
        actionable: true,
      });
    }
  }

  return out.sort((a, b) => {
    const byModule = a.parentModuleId.localeCompare(b.parentModuleId);
    if (byModule !== 0) return byModule;
    const byParent = a.parentRuleId.localeCompare(b.parentRuleId);
    if (byParent !== 0) return byParent;
    return VARIANT_PRIORITY[a.variantKind] - VARIANT_PRIORITY[b.variantKind] || a.id.localeCompare(b.id);
  });
}

export function normalizeRuleListLines(lines: Iterable<string>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    const trimmed = String(line ?? "").trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

function buildSignature(lines: string[]): string {
  return [...lines].sort((a, b) => a.localeCompare(b)).join("\n");
}

function isCoveredByGeolocationCn(lines: string[], geolocationCnLineSet: Set<string>): boolean {
  if (lines.length === 0) return false;
  return lines.every((line) => geolocationCnLineSet.has(line));
}

type CandidateWithContent = {
  candidate: CnRuleCandidate;
  lines: string[];
  signature: string;
};

export function buildCnRuleCandidatesFromSources(
  sources: CnRuleCandidateSource[],
  geolocationCnLines: Iterable<string>
): CnRuleCandidate[] {
  const geolocationCnLineSet = new Set(normalizeRuleListLines(geolocationCnLines));
  const candidates: CandidateWithContent[] = [];
  const duplicateGroups = new Map<string, CandidateWithContent[]>();

  for (const source of sources) {
    const id = source.id.trim();
    if (!id) continue;

    const lines = normalizeRuleListLines(source.lines);
    const signature = buildSignature(lines);
    const item: CandidateWithContent = {
      lines,
      signature,
      candidate: {
        id,
        name: id,
        behavior: "domain",
        format: "mrs",
        path: `geosite/${id}.mrs`,
        parentRuleId: source.parentRuleId,
        parentModuleId: source.parentModuleId,
        variantKind: source.variantKind,
        canonicalId: id,
        coveredByGeolocationCn: isCoveredByGeolocationCn(lines, geolocationCnLineSet),
        empty: lines.length === 0,
        actionable: false,
      },
    };

    candidates.push(item);
    if (!item.candidate.empty) {
      const group = duplicateGroups.get(signature) || [];
      group.push(item);
      duplicateGroups.set(signature, group);
    }
  }

  for (const group of duplicateGroups.values()) {
    const [canonical] = [...group].sort((a, b) => {
      const byPriority = VARIANT_PRIORITY[a.candidate.variantKind] - VARIANT_PRIORITY[b.candidate.variantKind];
      if (byPriority !== 0) return byPriority;
      return a.candidate.id.localeCompare(b.candidate.id);
    });

    for (const item of group) {
      item.candidate.canonicalId = canonical.candidate.id;
      if (item.candidate.id !== canonical.candidate.id) {
        item.candidate.duplicateOf = canonical.candidate.id;
      }
    }
  }

  return candidates
    .map(({ candidate }) => ({
      ...candidate,
      actionable: !candidate.empty && !candidate.duplicateOf && !candidate.coveredByGeolocationCn,
    }))
    .sort((a, b) => {
      const byModule = a.parentModuleId.localeCompare(b.parentModuleId);
      if (byModule !== 0) return byModule;
      const byParent = a.parentRuleId.localeCompare(b.parentRuleId);
      if (byParent !== 0) return byParent;
      return VARIANT_PRIORITY[a.variantKind] - VARIANT_PRIORITY[b.variantKind] || a.id.localeCompare(b.id);
    });
}
