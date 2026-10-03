import { useId } from "react";
import type { MachineKind, MachineStatus } from "@/lib/laundry-store";

export function MachineIllustration({ kind, status }: { kind: MachineKind; status: MachineStatus }) {
  const id = useId().replace(/:/g, "");
  const dryer = kind === "dryer";
  const running = status === "running";
  const offline = status === "offline";
  const accent = offline ? "#98a2b3" : dryer ? "#ff956d" : "#5875ff";
  const light = status === "available" ? "#31b887" : status === "finished" ? "#eab43d" : accent;

  return (
    <svg viewBox="0 0 220 210" aria-hidden="true" className={`machine-model h-auto w-full max-w-[210px] ${offline ? "opacity-55" : ""}`}>
      <defs>
        <linearGradient id={`${id}-body`} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#fff" /><stop offset="1" stopColor={dryer ? "#fff0e7" : "#e8eeff"} />
        </linearGradient>
        <linearGradient id={`${id}-glass`} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#293657" /><stop offset="1" stopColor="#10192e" />
        </linearGradient>
        <clipPath id={`${id}-window`}><circle cx="106" cy="120" r="43" /></clipPath>
      </defs>
      <ellipse cx="113" cy="196" rx="79" ry="9" fill="#17203a" opacity=".08" />
      <path d="M169 22 186 35V181L170 193V22Z" fill={dryer ? "#e9cbb8" : "#c6d1eb"} />
      <rect x="29" y="22" width="143" height="171" rx="15" fill={`url(#${id}-body)`} stroke={dryer ? "#e8d9cf" : "#d4dced"} strokeWidth="2" />
      <path d="M30 66h141" stroke="#d5dce9" strokeWidth="2" />
      <rect x="42" y="37" width="38" height="15" rx="4" fill="#dfe5f0" />
      <path d="M49 43h23" stroke="#aab6cd" strokeWidth="2" strokeLinecap="round" />
      <circle cx="97" cy="45" r="10" fill="#fff" stroke="#b9c5db" strokeWidth="2" />
      <path d="M97 38v5" stroke={accent} strokeWidth="2" strokeLinecap="round" />
      <rect x="116" y="35" width="43" height="21" rx="5" fill="#17203a" />
      <circle cx="126" cy="45" r="3" fill={light} />
      <path d="M135 43h15m-15 5h9" stroke={light} strokeWidth="2" strokeLinecap="round" />
      <circle cx="106" cy="120" r="54" fill={accent} opacity=".14" />
      <circle cx="106" cy="120" r="49" fill="#fff" stroke="#bac6dd" strokeWidth="2" />
      <circle cx="106" cy="120" r="43" fill={`url(#${id}-glass)`} />
      <g clipPath={`url(#${id}-window)`}>
        <g className={running ? `machine-drum ${dryer ? "machine-drum-dryer" : ""}` : ""}>
          <circle cx="106" cy="120" r="37" fill="none" stroke="#6d7b98" strokeWidth="2" strokeDasharray="3 8" opacity=".5" />
          {status !== "available" && !offline && <>
            <path d="m74 118 13-9 12 4 7 21-12 10-20-8Z" fill={dryer ? "#ffb58b" : "#86a4ff"} />
            <path d="m107 97 16-5 11 15-5 16-17-4-9-12Z" fill="#ddf86e" />
            <path d="m108 133 13-9 20 12-5 19-22-3Z" fill="#f391b4" />
          </>}
          <path d="m106 82 4 9m29 43-8-5m-56 5 8-5" stroke="#a7b5ce" strokeWidth="3" strokeLinecap="round" />
        </g>
        {!dryer && running && <path d="M61 143q12-8 23 0t23 0t23 0t23 0v22H61Z" fill="#87c9ee" opacity=".35" />}
        <path d="M76 103q8-16 24-18" fill="none" stroke="#fff" opacity=".2" strokeWidth="5" strokeLinecap="round" />
      </g>
      <path d="M150 111v17" stroke="#c6cfe0" strokeWidth="5" strokeLinecap="round" />
      {dryer ? <g stroke="#d4b7a4" strokeWidth="2" strokeLinecap="round"><path d="M47 175h28m-28 5h28" /></g> : <rect x="44" y="174" width="22" height="8" rx="3" fill="#d2dbeb" />}
      <circle cx="151" cy="179" r="4" fill={light} />
      <path d="M43 193v4m115-4v4" stroke="#8a96af" strokeWidth="5" strokeLinecap="round" />
      {status === "available" && <g transform="translate(151 132)"><circle r="15" fill="#d8f6e8" stroke="#fff" strokeWidth="3" /><path d="m-6 0 4 4 8-9" fill="none" stroke="#168761" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></g>}
      {status === "finished" && <g transform="translate(151 132)"><circle r="15" fill="#fff1c9" stroke="#fff" strokeWidth="3" /><path d="m-6 0 4 4 8-9" fill="none" stroke="#996b08" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></g>}
      {offline && <g transform="translate(151 132)"><circle r="15" fill="#edf0f6" stroke="#fff" strokeWidth="3" /><path d="m-5-5 10 10m0-10-10 10" stroke="#667085" strokeWidth="3" strokeLinecap="round" /></g>}
    </svg>
  );
}
