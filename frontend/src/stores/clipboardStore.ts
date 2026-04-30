import { defineStore } from "pinia";
import type {
  CopiedPod,
  CopiedRepositoryNote,
  CopiedCommandNote,
  CopiedConnection,
} from "@/types";

interface ClipboardState {
  copiedPods: CopiedPod[];
  copiedRepositoryNotes: CopiedRepositoryNote[];
  copiedCommandNotes: CopiedCommandNote[];
  copiedConnections: CopiedConnection[];
}

export const useClipboardStore = defineStore("clipboard", {
  state: (): ClipboardState => ({
    copiedPods: [],
    copiedRepositoryNotes: [],
    copiedCommandNotes: [],
    copiedConnections: [],
  }),

  getters: {
    isEmpty: (state): boolean =>
      state.copiedPods.length === 0 &&
      state.copiedRepositoryNotes.length === 0 &&
      state.copiedCommandNotes.length === 0 &&
      state.copiedConnections.length === 0,
  },

  actions: {
    setCopy(
      pods: CopiedPod[],
      repositoryNotes: CopiedRepositoryNote[],
      commandNotes: CopiedCommandNote[],
      connections: CopiedConnection[],
    ): void {
      this.copiedPods = pods;
      this.copiedRepositoryNotes = repositoryNotes;
      this.copiedCommandNotes = commandNotes;
      this.copiedConnections = connections;
    },

    clear(): void {
      this.copiedPods = [];
      this.copiedRepositoryNotes = [];
      this.copiedCommandNotes = [];
      this.copiedConnections = [];
    },

    getCopiedData(): {
      pods: CopiedPod[];
      repositoryNotes: CopiedRepositoryNote[];
      commandNotes: CopiedCommandNote[];
      connections: CopiedConnection[];
    } {
      return {
        pods: this.copiedPods,
        repositoryNotes: this.copiedRepositoryNotes,
        commandNotes: this.copiedCommandNotes,
        connections: this.copiedConnections,
      };
    },
  },
});
