import { Trash2 } from "lucide-react";
import { ImageUpload } from "@/components/form/ImageUpload";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isImageUrl } from "@/lib/links";

// Upload or paste an https:// / /img/... URL. The preview only ever shows a valid server-side URL (the CSP blocks the rest).
export function BannerUpload({ id = "banner", value, onChange, kind = "banner" }) {
  const v = value ?? "";
  return (
    <div className="space-y-2">
      <ImageUpload id={`${id}_file`} value={isImageUrl(v) ? v : ""} kind={kind} onChange={(url) => onChange(url)} />
      <div className="space-y-1.5">
        <Label htmlFor={id}>رابط الصورة</Label>
        <div className="flex gap-2">
          <Input id={id} dir="ltr" className="h-11 text-start" value={v} placeholder="https://… أو /img/…" onChange={(e) => onChange(e.target.value.trim())} />
          {v && <Button type="button" variant="outline" className="size-11 p-0" aria-label="إزالة الصورة" onClick={() => onChange("")}><Trash2 aria-hidden /></Button>}
        </div>
        {v && !isImageUrl(v) && <p role="alert" className="text-sm font-medium text-destructive">رابط صورة غير صالح: يُقبل رابط رفع (/img/…) أو https:// فقط</p>}
      </div>
    </div>
  );
}
