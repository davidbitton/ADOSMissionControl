/**
 * @module connect-dialog-store
 * @description Global state for the connect dialog open/close and operator prefs.
 * @license GPL-3.0-only
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

interface ConnectDialogState {
  open: boolean;
  /** When true, successful connect/pair leaves the modal open (for multi-craft / multi-link). */
  keepOpenAfterConnect: boolean;
  openDialog: () => void;
  closeDialog: () => void;
  setKeepOpenAfterConnect: (keepOpen: boolean) => void;
  /**
   * Call after a successful direct or agent connection.
   * Closes the dialog unless {@link keepOpenAfterConnect} is set.
   */
  notifyConnectSuccess: () => void;
}

export const useConnectDialogStore = create<ConnectDialogState>()(
  persist(
    (set, get) => ({
      open: false,
      keepOpenAfterConnect: false,
      openDialog: () => set({ open: true }),
      closeDialog: () => set({ open: false }),
      setKeepOpenAfterConnect: (keepOpen) => set({ keepOpenAfterConnect: keepOpen }),
      notifyConnectSuccess: () => {
        if (!get().keepOpenAfterConnect) {
          set({ open: false });
        }
      },
    }),
    {
      name: "ados-connect-dialog",
      version: 1,
      // Only persist operator preference; never restore `open: true` from storage
      partialize: (s) => ({ keepOpenAfterConnect: s.keepOpenAfterConnect }),
    },
  ),
);
