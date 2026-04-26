/** 目前只有一種 Group 類型，未來可擴充新類型 */
export type GroupType = "command";

export const GROUP_TYPES = {
  COMMAND: "command",
} as const;

export interface Group {
  id: string;
  name: string;
  type: GroupType;
}
