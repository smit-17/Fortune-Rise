import { toast } from "sonner";

/**
 * Shows a 10-second "Undo" toast after an important record is deleted.
 * `remove` runs immediately; `restore` runs only if the user taps Undo.
 */
export function deleteWithUndo({
  label,
  remove,
  restore,
}: {
  label: string;
  remove: () => void;
  restore: () => void;
}) {
  remove();
  let undone = false;
  toast.success(`${label} deleted`, {
    duration: 10000,
    description: "You can undo this for the next 10 seconds.",
    action: {
      label: "Undo",
      onClick: () => {
        if (undone) return;
        undone = true;
        restore();
        toast.success(`${label} restored`);
      },
    },
  });
}
