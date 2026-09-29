import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

// An alert dialog has no corner X; the 44px Arabic cancel button is the close control.
export function ConfirmDialog({ open, title, description, confirmLabel = "تأكيد", destructive, onConfirm, onOpenChange }) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description && <AlertDialogDescription>{description}</AlertDialogDescription>}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="h-11">إلغاء</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} className={cn("h-11", destructive && "bg-st-canceled-fg text-st-canceled-bg hover:bg-st-canceled-fg/90")}>{confirmLabel}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
