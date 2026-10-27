import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon
} from "lucide-react";
import { useTheme } from "next-themes";
import { Toaster as Sonner, type ToasterProps } from "sonner";

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  // 点 toast 任意位置就关掉：转给它自带的关闭按钮（需要 closeButton）。
  // toast 里的按钮（操作、关闭本身）照常走自己的点击。
  const dismissOnClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest("button, a")) return;
    target
      .closest("[data-sonner-toast]")
      ?.querySelector<HTMLButtonElement>("[data-close-button]")
      ?.click();
  };

  return (
    <div className="contents" onClick={dismissOnClick}>
      <Sonner
        theme={theme as ToasterProps["theme"]}
        className="toaster group"
        toastOptions={{ className: "cursor-pointer" }}
        icons={{
          success: <CircleCheckIcon className="size-4" />,
          info: <InfoIcon className="size-4" />,
          warning: <TriangleAlertIcon className="size-4" />,
          error: <OctagonXIcon className="size-4" />,
          loading: <Loader2Icon className="size-4 animate-spin" />
        }}
        style={
          {
            "--normal-bg": "var(--popover)",
            "--normal-text": "var(--popover-foreground)",
            "--normal-border": "var(--border)",
            "--border-radius": "var(--radius)"
          } as React.CSSProperties
        }
        {...props}
      />
    </div>
  );
};

export { Toaster };
