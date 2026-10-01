// EAN-13 kamera ile barkod okuma. Kamera izni yoksa elle giriş yapılabilir.
import { useEffect, useRef, useState } from "react";
import { isValidEan13 } from "@kapinda/shared-validation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ErrorState } from "@/components/ui/misc";

export function BarcodeScanner({ onDetected }: { onDetected: (code: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState("");
  const done = useRef(false);

  useEffect(() => {
    let stop: (() => void) | undefined;
    let cancelled = false;
    (async () => {
      try {
        const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([import("@zxing/browser"), import("@zxing/library")]);
        const hints = new Map();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13]);
        const reader = new BrowserMultiFormatReader(hints);
        if (cancelled || !videoRef.current) return;
        const controls = await reader.decodeFromConstraints({ video: { facingMode: "environment" } }, videoRef.current, (result) => {
          const text = result?.getText();
          if (text && isValidEan13(text) && !done.current) {
            done.current = true;
            controls.stop();
            onDetected(text);
          }
        });
        stop = () => controls.stop();
      } catch {
        setError("Kameraya erişilemedi. Barkodu elle girebilirsiniz.");
      }
    })();
    return () => {
      cancelled = true;
      stop?.();
    };
  }, [onDetected]);

  return (
    <div className="space-y-3">
      {!error && <video ref={videoRef} className="aspect-video w-full rounded-lg bg-black object-cover" muted playsInline aria-label="Barkod kamerası" />}
      {error && <ErrorState message={error} />}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (isValidEan13(manual.trim())) onDetected(manual.trim());
          else setError("Geçerli bir EAN-13 barkodu girin (13 hane).");
        }}
      >
        <Input inputMode="numeric" maxLength={13} placeholder="Barkod numarası" value={manual} onChange={(e) => setManual(e.target.value.replace(/\D/g, ""))} aria-label="Barkod numarası" />
        <Button type="submit" variant="secondary">Ara</Button>
      </form>
    </div>
  );
}
