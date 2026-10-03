import { createContext, useContext } from "react";
import type { DrawerConfig } from "./EntryDrawer";
import type { Preset } from "@/lib/lepdo/period";

export interface ShellContextValue {
  openEntry: (config: DrawerConfig) => void;
  search: string;
  setSearch: (value: string) => void;
  from: string;
  to: string;
  preset: Preset;
  setPreset: (preset: Preset) => void;
  customFrom: string;
  customTo: string;
  setCustomFrom: (value: string) => void;
  setCustomTo: (value: string) => void;
  /** handler registered by the Uchhina page for the header "+ Quick Uchhina" button */
  quickUchhina: (() => void) | null;
  setQuickUchhina: (handler: (() => void) | null) => void;
  /** primary action registered by a page for the header (e.g. "+ Add Sale") */
  pageAction: { label: string; run: () => void } | null;
  setPageAction: (action: { label: string; run: () => void } | null) => void;
}

export const ShellContext = createContext<ShellContextValue | null>(null);

export function useShell(): ShellContextValue {
  const context = useContext(ShellContext);
  if (!context) throw new Error("useShell must be used inside AppShell");
  return context;
}
