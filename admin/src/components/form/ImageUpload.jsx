import { useEffect, useRef, useState } from "react";
import { ImagePlus } from "lucide-react";
import { uploadImage } from "@/lib/upload";
import { cn } from "@/lib/utils";

// value: server image URL ("" or "." = none). onChange(url, saved) after a successful upload.
// The preview is always the server URL (the admin CSP has no blob:).
export function ImageUpload({ id = "image", value, onChange, kind = "product", disabled }) {
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const busyRef = useRef(false);
  const abortRef = useRef(null);
  useEffect(() => () => abortRef.current?.abort(), []);

  async function pick(file) {
    if (!file || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    setStatus("جارٍ رفع الصورة...");
    abortRef.current = new AbortController();
    try {
      const saved = await uploadImage(file, { kind, signal: abortRef.current.signal });
      onChange(saved.url, saved);
      setStatus("تم رفع الصورة");
    } catch (err) {
      if (err?.name === "AbortError") return;
      setStatus("");
      setError(err?.message || "فشل رفع الصورة");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  const hasImage = value && value !== ".";
  return (
    <div className="space-y-2">
      <div
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); if (!disabled) pick(e.dataTransfer.files?.[0]); }}
        className={cn("flex flex-wrap items-center gap-3 rounded-lg border-2 border-dashed p-3", over && "border-primary bg-accent")}
      >
        {hasImage && <img src={value} alt="معاينة الصورة" className="size-20 rounded-md border object-cover" />}
        <label
          htmlFor={id}
          className={cn("inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md border bg-background px-4 text-sm font-medium has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50", (busy || disabled) && "pointer-events-none opacity-50")}
        >
          <ImagePlus className="size-4" aria-hidden />
          {hasImage ? "استبدال الصورة" : "اختيار صورة أو إسقاطها هنا"}
          <input id={id} type="file" className="sr-only" accept="image/jpeg,image/png,image/webp" disabled={busy || disabled}
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; pick(f); }} />
        </label>
      </div>
      <p role="status" className="min-h-5 text-sm text-muted-foreground">{status}</p>
      {error && <p role="alert" className="text-sm font-medium text-destructive">{error}</p>}
    </div>
  );
}
