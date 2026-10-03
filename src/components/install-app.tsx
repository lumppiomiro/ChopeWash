"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Download, Share, SquarePlus, Smartphone, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

type InstallPrompt = Event & { prompt: () => Promise<{ outcome: "accepted" | "dismissed" }>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
const InstallContext = createContext<{ prompt: InstallPrompt | null; setPrompt: (prompt: InstallPrompt | null) => void; installed: boolean; ios: boolean }>({ prompt: null, setPrompt: () => {}, installed: false, ios: false });

export function PwaProvider({ children }: { children: ReactNode }) {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [installed, setInstalled] = useState(false);
  const [ios, setIos] = useState(false);
  useEffect(() => {
    if ("serviceWorker" in navigator) void navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {});
    const standalone = window.matchMedia("(display-mode: standalone)");
    const update = () => setInstalled(standalone.matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
    const timer = window.setTimeout(() => {
      update();
      setIos(/iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));
    }, 0);
    const capture = (event: Event) => { event.preventDefault(); setPrompt(event as InstallPrompt); };
    const complete = () => { setInstalled(true); setPrompt(null); };
    window.addEventListener("beforeinstallprompt", capture);
    window.addEventListener("appinstalled", complete);
    standalone.addEventListener("change", update);
    return () => { window.clearTimeout(timer); window.removeEventListener("beforeinstallprompt", capture); window.removeEventListener("appinstalled", complete); standalone.removeEventListener("change", update); };
  }, []);
  return <InstallContext.Provider value={{ prompt, setPrompt, installed, ios }}>{children}</InstallContext.Provider>;
}

export function InstallApp() {
  const { prompt, setPrompt, installed, ios } = useContext(InstallContext);
  const [guide, setGuide] = useState(false);
  const [installing, setInstalling] = useState(false);
  const install = async () => {
    if (!prompt) { setGuide(true); return; }
    setInstalling(true);
    try { await prompt.prompt(); await prompt.userChoice; }
    catch { setGuide(true); }
    finally { setPrompt(null); setInstalling(false); }
  };
  if (installed) return <p className="flex items-center gap-2 px-1 py-2 text-sm text-muted-foreground"><Check className="size-4 text-emerald-600" />ChopeWash is running as an installed app</p>;
  return <>
    <button onClick={() => void install()} disabled={installing} className="flex w-full items-center gap-3 rounded-2xl border bg-white p-4 text-left hover:bg-surface"><Download className="size-5 text-primary" /><span><span className="block text-sm font-extrabold">{installing ? "Opening install prompt…" : "Install ChopeWash"}</span><span className="block text-xs text-muted-foreground">Add it to your Home Screen for quick access</span></span></button>
    <Dialog open={guide} onOpenChange={setGuide}><DialogContent className="rounded-[28px]"><DialogHeader><DialogTitle className="text-2xl font-black">ChopeWash on your Home Screen</DialogTitle><DialogDescription>Open your laundry status with a single tap. No app store needed.</DialogDescription></DialogHeader>
      <ol className="space-y-3">{(ios ? [
        [Share, "Open the browser’s Share menu", "In Safari, look for the square with an upward arrow. You may need to open the browser menu first."],
        [SquarePlus, "Choose Add to Home Screen", "Scroll through the actions. If available, keep Open as Web App enabled."],
        [Smartphone, "Tap Add, then open ChopeWash", "Launch it from your new Home Screen icon."],
      ] : [
        [Smartphone, "Open ChopeWash in your browser", "Use Chrome or Edge for the simplest installation. If you opened a link inside another app, open it in your browser first."],
        [SquarePlus, "Open the browser menu", "Look for Install app, Add to Home Screen, or the install icon in the address bar."],
        [Check, "Confirm and open ChopeWash", "Launch it using the new icon. Available options depend on your browser."],
      ]).map(([Icon, title, detail], index) => { const StepIcon = Icon as typeof Share; return <li key={index} className="flex gap-3 rounded-2xl bg-surface p-4"><StepIcon className="mt-1 size-5 shrink-0 text-primary" /><div><p className="text-sm font-bold">{index + 1}. {String(title)}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{String(detail)}</p></div></li>; })}</ol>
      <p className="text-xs leading-5 text-muted-foreground">{ios ? "Apple requires these browser steps; a website can’t skip them." : "If no install option appears, you can bookmark ChopeWash and keep using it in your browser."}</p><Button onClick={() => setGuide(false)} className="rounded-2xl">Got it</Button>
    </DialogContent></Dialog>
  </>;
}
