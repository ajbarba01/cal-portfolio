import { Inbox } from "lucide-react";
import { cn } from "@/lib/utils";

type EmptyStateProps = {
  title: React.ReactNode;
  message?: React.ReactNode;
  action?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
};

export function EmptyState({
  title,
  message,
  action,
  icon,
  className,
}: EmptyStateProps) {
  return (
    <div
      data-slot="empty-state"
      className={cn(
        "mx-auto flex max-w-sm flex-col items-center gap-2 py-16 text-center",
        className,
      )}
    >
      <span className="bg-muted text-muted-foreground flex size-11 items-center justify-center rounded-full">
        {icon ?? <Inbox className="size-5" />}
      </span>
      <h2 className="text-lg font-semibold">{title}</h2>
      {message ? (
        <p className="text-muted-foreground text-sm">{message}</p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
