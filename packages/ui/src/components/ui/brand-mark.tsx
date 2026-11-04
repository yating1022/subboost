import * as React from "react";

/**
 * SubBoost 品牌标记：三条支流汇入主干，单色石墨底 + 暖白细线。
 *
 * 与 `docs/assets/logo.svg` 同一几何，但线宽按 24-40px 的界面尺寸加粗，
 * 保证标签页/页头等小尺寸下仍可辨识；渐变与闪电已弃用。
 */
export const SUBBOOST_BRAND_PLATE = "#0C0D0F";
export const SUBBOOST_BRAND_LINE = "#F2EFEA";
export const SUBBOOST_BRAND_LINE_MUTED = "#E4E1DA";

/** 界面尺寸下的描边宽度（viewBox 64 单位） */
const STROKE_WIDTH = 3.2;

export type BrandMarkProps = React.SVGProps<SVGSVGElement> & {
  /** 装饰性使用时保持默认 true；作为唯一可读标识时传 false，由 aria-label 提供名称。 */
  decorative?: boolean;
};

export function BrandMark({ decorative = true, className, ...props }: BrandMarkProps) {
  return (
    <svg
      viewBox="0 0 64 64"
      role={decorative ? undefined : "img"}
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : "SubBoost"}
      focusable="false"
      className={className}
      {...props}
    >
      <rect width="64" height="64" rx="16" fill={SUBBOOST_BRAND_PLATE} />
      <rect
        x="0.6"
        y="0.6"
        width="62.8"
        height="62.8"
        rx="15.4"
        fill="none"
        stroke="#FFFFFF"
        strokeOpacity="0.18"
        strokeWidth="1.2"
      />
      <g
        transform="translate(32 32) scale(1.15) translate(-32 -32)"
        fill="none"
        strokeLinecap="round"
        stroke={SUBBOOST_BRAND_LINE_MUTED}
        strokeOpacity="0.6"
        strokeWidth={STROKE_WIDTH}
      >
        <path d="M9 21h14c8 0 13 11 20 11" />
        <path d="M9 43h14c8 0 13-11 20-11" />
      </g>
      <path
        transform="translate(32 32) scale(1.15) translate(-32 -32)"
        d="M9 32h47"
        fill="none"
        stroke={SUBBOOST_BRAND_LINE}
        strokeWidth={STROKE_WIDTH}
        strokeLinecap="round"
      />
    </svg>
  );
}
