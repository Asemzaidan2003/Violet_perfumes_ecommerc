import { Link } from "react-router-dom";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

export const ADD_LINKS = [
  { to: "/products/new", label: "أضف عطر جديد" },
  { to: "/oils/new", label: "أضف زيت جديد" },
  { to: "/bottles/new", label: "أضف زجاجة جديدة" },
];

export default function AddMenu({ className }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button className={`h-11 gap-2 ${className ?? ""}`} aria-label="إضافة جديد"><Plus className="size-5" aria-hidden /><span>إضافة</span></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-48">
        {ADD_LINKS.map((l) => (
          <DropdownMenuItem key={l.to} asChild className="min-h-11 cursor-pointer text-base">
            <Link to={l.to}>{l.label}</Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
