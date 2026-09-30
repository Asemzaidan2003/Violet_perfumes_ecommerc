import { ConfirmDialog } from "@/components/ConfirmDialog";

export function DeleteConfirm({ open, name, onConfirm, onOpenChange, message }) {
  return (
    <ConfirmDialog open={open} title={`حذف «${name ?? ""}»؟`} description={message ?? "لا يمكن التراجع عن الحذف."}
      confirmLabel="حذف" destructive onConfirm={onConfirm} onOpenChange={onOpenChange} />
  );
}
