import { MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { waLink } from "@/lib/format";

export function WhatsAppLink({ phone, name, className }) {
  if (!phone || phone === "-") return null;
  return (
    <a href={waLink(phone)} target="_blank" rel="noopener noreferrer" aria-label={`واتساب ${name ?? ""}`.trim()}
      className={cn("inline-flex h-11 items-center gap-1.5 rounded-md border px-3 text-sm font-medium hover:bg-accent hover:text-accent-foreground", className)}>
      <MessageCircle className="size-4" aria-hidden /> واتساب
    </a>
  );
}
