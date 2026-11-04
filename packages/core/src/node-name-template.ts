export const DEFAULT_NODE_NAME_TEMPLATE = "[{tag}]{name}";

export function formatNodeNameFromTemplate(params: {
  originName: string;
  tag?: string;
  template?: string;
}): string {
  const originName = params.originName.trim();
  if (!originName) return "";

  const tag = typeof params.tag === "string" ? params.tag.trim() : "";
  if (!tag) return originName;

  const template = typeof params.template === "string" ? params.template.trim() : "";
  const pattern = template || DEFAULT_NODE_NAME_TEMPLATE;

  const formatted = pattern.replaceAll("{tag}", tag).replaceAll("{name}", originName).trim();
  return formatted || originName;
}
