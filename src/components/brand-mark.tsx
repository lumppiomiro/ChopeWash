import { Waves } from "lucide-react";

export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className="inline-flex items-center gap-2.5" aria-label="ChopeWash">
      <span className="grid size-10 place-items-center rounded-[14px] bg-primary text-primary-foreground shadow-[0_8px_24px_rgba(47,77,255,0.26)]">
        <Waves className="size-5" strokeWidth={2.4} />
      </span>
      {!compact && (
        <span className="text-[1.18rem] font-black tracking-[-0.05em] text-ink">
          Chope<span className="text-primary">Wash</span>
        </span>
      )}
    </div>
  );
}
