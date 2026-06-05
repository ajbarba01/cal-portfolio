"use client";

import { Toast } from "@base-ui/react/toast";
import { Check, AlertTriangle, X } from "lucide-react";
import { cn } from "@/lib/utils";

export function ToastProvider({ children }: { children: React.ReactNode }) {
  return (
    <Toast.Provider>
      {children}
      <Toaster />
    </Toast.Provider>
  );
}

export const useToast = Toast.useToastManager;

function Toaster() {
  const { toasts } = Toast.useToastManager();
  return (
    <Toast.Portal>
      <Toast.Viewport
        className={cn(
          "fixed z-[100] flex flex-col gap-2 outline-none",
          "inset-x-0 bottom-0 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]",
          "sm:inset-x-auto sm:top-0 sm:right-0 sm:bottom-auto sm:w-96",
        )}
      >
        {toasts.map((toast) => {
          const isError = toast.type === "error";
          return (
            <Toast.Root
              key={toast.id}
              toast={toast}
              data-slot="toast"
              className="bg-card text-card-foreground border-border relative flex items-start gap-3 overflow-hidden rounded-xl border p-3 pr-2 shadow-lg"
            >
              <span
                className={cn(
                  "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg",
                  isError
                    ? "bg-destructive/10 text-destructive"
                    : "bg-status-available text-status-available-foreground",
                )}
              >
                {isError ? (
                  <AlertTriangle className="size-4" />
                ) : (
                  <Check className="size-4" />
                )}
              </span>
              <div className="flex flex-1 flex-col">
                <Toast.Title className="text-sm font-semibold" />
                <Toast.Description className="text-muted-foreground text-xs" />
              </div>
              <Toast.Close
                aria-label="Dismiss"
                className="text-muted-foreground hover:text-foreground rounded-md p-1"
              >
                <X className="size-4" />
              </Toast.Close>
            </Toast.Root>
          );
        })}
      </Toast.Viewport>
    </Toast.Portal>
  );
}
