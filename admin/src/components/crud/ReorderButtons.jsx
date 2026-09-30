import { ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ReorderButtons({ onUp, onDown, disableUp, disableDown, label }) {
  return (
    <div className="flex gap-2">
      <Button type="button" variant="outline" className="size-11 p-0" aria-label={`رفع ${label}`} disabled={disableUp} onClick={onUp}><ChevronUp aria-hidden /></Button>
      <Button type="button" variant="outline" className="size-11 p-0" aria-label={`خفض ${label}`} disabled={disableDown} onClick={onDown}><ChevronDown aria-hidden /></Button>
    </div>
  );
}
