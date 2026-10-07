import type { CSSProperties } from "react";

type MosaicRailProps = {
  filled: number;
  total: number;
  label?: string;
  compact?: boolean;
  inverse?: boolean;
};

export function MosaicRail({ filled, total, label, compact = false, inverse = false }: MosaicRailProps) {
  const safeTotal = Math.max(1, Math.min(total, 24));
  const safeFilled = Math.max(0, Math.min(filled, safeTotal));

  return (
    <div
      aria-label={label ?? `${safeFilled} of ${safeTotal} moments collected`}
      aria-valuemax={safeTotal}
      aria-valuemin={0}
      aria-valuenow={safeFilled}
      className={`mosaic-rail${compact ? " mosaic-rail--compact" : ""}${inverse ? " mosaic-rail--inverse" : ""}`}
      role="progressbar"
    >
      {!compact ? (
        <div className="mosaic-rail__label">
          <span>{label ?? "Shared mosaic"}</span>
          <span>{safeFilled}/{safeTotal}</span>
        </div>
      ) : null}
      <span className="mosaic-rail__track" style={{ "--mosaic-columns": safeTotal } as CSSProperties}>
        {Array.from({ length: safeTotal }, (_, index) => (
          <span
            className="mosaic-rail__cell"
            data-filled={index < safeFilled}
            data-recent={index === safeFilled - 1}
            key={index}
          />
        ))}
      </span>
    </div>
  );
}
