export {
  DEFAULT_RULE_PROVIDER_BASE_URL,
  RULE_CATEGORIES,
  RULE_PROVIDER_CONFIG,
  type RuleCategory,
} from "./provider-config";

import type { RuleCategory } from "./provider-config";

export interface RuleSetInfo {
  id: string;
  name: string;
  nameZh: string;
  category: RuleCategory;
  behavior: "domain" | "ipcidr";
  format: "mrs";
  url: string;
}
