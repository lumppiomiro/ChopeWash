import Image from "next/image";

export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className="inline-flex items-center gap-2.5" aria-label="ChopeWash">
      <Image
        src="/branding/chopewash-logo.jpg"
        alt=""
        width={40}
        height={40}
        className="size-10 shrink-0 rounded-xl bg-white object-contain"
      />
      {!compact && (
        <span className="text-[1.18rem] font-black tracking-[-0.05em] text-ink">
          Chope<span className="text-primary">Wash</span>
        </span>
      )}
    </div>
  );
}
