export const RULE_PROVIDER_CONFIG = {
  baseUrl: "https://github.com/MetaCubeX/meta-rules-dat/raw/refs/heads/meta/geo",
  github: {
    owner: "MetaCubeX",
    repo: "meta-rules-dat",
    ref: "meta",
  },
  treePath: "geo",
  directories: {
    geosite: "geosite",
    geoip: "geoip",
  },
  cacheTtlMs: 24 * 60 * 60 * 1000,
  categories: {
    ads: { name: "广告拦截", emoji: "🛑" },
    ai: { name: "AI 服务", emoji: "🤖" },
    common: { name: "常用服务", emoji: "🌐" },
    media: { name: "流媒体", emoji: "🎬" },
    social: { name: "社交通讯", emoji: "💬" },
    game: { name: "游戏平台", emoji: "🎮" },
    tech: { name: "技术服务", emoji: "🛠️" },
    finance: { name: "金融服务", emoji: "💰" },
    geo: { name: "地理位置", emoji: "🗺️" },
    edu: { name: "教育学术", emoji: "🎓" },
    shopping: { name: "购物电商", emoji: "🛍️" },
    news: { name: "新闻资讯", emoji: "📰" },
    cn: { name: "中国服务", emoji: "🇨🇳" },
    privacy: { name: "隐私安全", emoji: "🔒" },
    other: { name: "其他", emoji: "✨" },
  },
} as const;

export const DEFAULT_RULE_PROVIDER_BASE_URL = RULE_PROVIDER_CONFIG.baseUrl;
export const RULE_CATEGORIES = RULE_PROVIDER_CONFIG.categories;
export type RuleCategory = keyof typeof RULE_CATEGORIES;
