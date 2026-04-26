import { createNoteStore } from "./GenericNoteStore.js";
import type { RepositoryNote, CommandNote } from "../types";

export const repositoryNoteStore = createNoteStore<
  RepositoryNote,
  "repositoryId"
>({
  noteType: "repository",
  foreignKeyField: "repositoryId",
  storeName: "RepositoryNoteStore",
});

export const commandNoteStore = createNoteStore<CommandNote, "commandId">({
  noteType: "command",
  foreignKeyField: "commandId",
  storeName: "CommandNoteStore",
});
