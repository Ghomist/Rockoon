import {
  Info,
  CircleCheck,
  TriangleAlert,
  OctagonX,
  type LucideIcon
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useDialogStore, type DialogVariant } from "@/utils/ui/dialog-store";

const iconFor = (v: DialogVariant): LucideIcon | undefined => {
  switch (v) {
    case "info":
      return Info;
    case "success":
      return CircleCheck;
    case "warning":
      return TriangleAlert;
    case "error":
      return OctagonX;
    default:
      return undefined;
  }
};

const accentClass = (v: DialogVariant): string => {
  switch (v) {
    case "info":
      return "text-blue-500";
    case "success":
      return "text-emerald-500";
    case "warning":
      return "text-amber-500";
    case "error":
      return "text-destructive";
    default:
      return "";
  }
};

/** Renders all open dialogs from the store. Mount once at the app root. */
export default function GlobalDialogHost() {
  const dialogs = useDialogStore(s => s.dialogs);
  const dismiss = useDialogStore(s => s.dismiss);
  const confirm = useDialogStore(s => s.confirm);
  const cancel = useDialogStore(s => s.cancel);

  return (
    <>
      {dialogs.map(d => {
        const Icon = iconFor(d.variant);
        const ContentFn = typeof d.content === "function" ? d.content : null;
        return (
          <Dialog
            key={d.id}
            open
            onOpenChange={v => {
              if (!v) dismiss(d.id);
            }}
          >
            <DialogContent className={cn("max-w-md", d.className)}>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {Icon && (
                    <Icon className={cn("size-5", accentClass(d.variant))} />
                  )}
                  {d.title}
                </DialogTitle>
                {typeof d.content === "string" && (
                  <DialogDescription className="whitespace-pre-line">
                    {d.content}
                  </DialogDescription>
                )}
              </DialogHeader>

              {ContentFn && (
                // min-w-0：让内部的横向滚动容器（选键键盘）能真的缩到弹窗宽度，
                // 否则 flex 子项默认 min-width:auto，会把弹窗顶宽。
                <div className="w-full min-w-0 text-sm text-muted-foreground">
                  <ContentFn />
                </div>
              )}

              <DialogFooter>
                {d.negativeText && (
                  <Button variant="outline" onClick={() => cancel(d.id)}>
                    {d.negativeText}
                  </Button>
                )}
                <Button onClick={() => confirm(d.id)}>{d.positiveText}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        );
      })}
    </>
  );
}
