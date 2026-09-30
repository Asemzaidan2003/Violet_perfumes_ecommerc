import { useState } from "react";
import { ChevronDown, ChevronUp, ImagePlus, Star, X } from "lucide-react";
import { toast } from "sonner";
import { uploadImage } from "@/lib/upload";
import { IMAGE_ERROR, IMAGE_URL } from "@/lib/productForm";
import { Field } from "@/components/form/fields";
import { ImageUpload } from "@/components/form/ImageUpload";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// Primary image (single) plus an additional-images gallery. `image`/`onImageChange` drive p_image,
// `images`/`onImagesChange` drive images[]; "." (no image) is a primary-only placeholder and is never
// pushed into the gallery.
export function MediaSection({ image, images, onImageChange, onImagesChange, error, invalid }) {
  const [busy, setBusy] = useState(false);

  async function addFiles(files) {
    if (!files?.length) return;
    setBusy(true);
    const added = [];
    for (const file of files) {
      try {
        const saved = await uploadImage(file, { kind: "product" });
        added.push(saved.url);
      } catch (err) {
        // One bad file (too large, wrong type, network hiccup on its thumb) doesn't stop the batch —
        // the product stays usable with whatever uploaded, and the admin sees which file failed.
        toast.error(`${file.name}: ${err?.message || "فشل رفع الصورة"}`);
      }
    }
    if (added.length) onImagesChange([...images, ...added]);
    setBusy(false);
  }

  const move = (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= images.length) return;
    const next = [...images];
    [next[i], next[j]] = [next[j], next[i]];
    onImagesChange(next);
  };

  return (
    <>
      <ImageUpload id="p_image_file" value={IMAGE_URL.test(image.trim()) ? image.trim() : ""} onChange={onImageChange} />
      <div className="flex flex-wrap items-end gap-2">
        <Field label="رابط الصورة" htmlFor="p_image" className="min-w-48 flex-1"
          hint="اتركه فارغًا بلا صورة. يُقبل رابط https:// أو صورة مرفوعة فقط (لا يُقبل http://)." error={error ? IMAGE_ERROR : undefined}>
          <Input id="p_image" className="h-11 text-start" dir="ltr" value={image} aria-invalid={invalid} onChange={(e) => onImageChange(e.target.value)} />
        </Field>
        <Button type="button" variant="outline" className="h-11" onClick={() => onImageChange(".")}>بدون صورة</Button>
      </div>

      <div className="space-y-2">
        <span className="text-sm font-medium">صور إضافية</span>
        {images.length > 0 && (
          <ul className="flex flex-wrap gap-3">
            {images.map((url, i) => (
              <li key={url + i} className="flex flex-col items-center gap-1.5 rounded-md border p-2">
                <img src={url} alt={`صورة إضافية ${i + 1}`} className="size-20 rounded-md border object-cover" />
                <div className="flex gap-2">
                  <Button type="button" variant="outline" className="size-11" aria-label={`تحريك الصورة ${i + 1} للأعلى`} disabled={i === 0} onClick={() => move(i, -1)}>
                    <ChevronUp aria-hidden />
                  </Button>
                  <Button type="button" variant="outline" className="size-11" aria-label={`تحريك الصورة ${i + 1} للأسفل`} disabled={i === images.length - 1} onClick={() => move(i, 1)}>
                    <ChevronDown aria-hidden />
                  </Button>
                  <Button type="button" variant="outline" className="size-11" aria-label={`جعل الصورة ${i + 1} الرئيسية`} onClick={() => onImageChange(url)}>
                    <Star aria-hidden />
                  </Button>
                  <Button type="button" variant="outline" className="size-11" aria-label={`إزالة الصورة ${i + 1}`} onClick={() => onImagesChange(images.filter((_, k) => k !== i))}>
                    <X aria-hidden />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <label
          htmlFor="gallery_file"
          className={cn("inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md border bg-background px-4 text-sm font-medium has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50", busy && "pointer-events-none opacity-50")}
        >
          <ImagePlus className="size-4" aria-hidden />
          إضافة صور
          <input id="gallery_file" type="file" multiple className="sr-only" accept="image/jpeg,image/png,image/webp" disabled={busy}
            onChange={(e) => { const files = [...e.target.files]; e.target.value = ""; addFiles(files); }} />
        </label>
      </div>
    </>
  );
}
