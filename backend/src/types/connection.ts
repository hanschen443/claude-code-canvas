export type AnchorPosition = "top" | "bottom" | "left" | "right";

export type TriggerMode = "auto" | "ai-decide" | "direct";

export type AutoTriggerMode = Extract<TriggerMode, "auto" | "ai-decide">;

export type DecideStatus =
  | "none"
  | "pending"
  | "approved"
  | "rejected"
  | "error";

export type ConnectionStatus =
  | "idle"
  | "active"
  | "queued"
  | "waiting"
  | "ai-deciding"
  | "ai-approved"
  | "ai-rejected"
  | "ai-error";

/** aiDecideModel 硬性鎖定 Claude 三選一（不接受第三方模型） */
export type AiDecideModelType = "opus" | "sonnet" | "haiku";

export interface Connection {
  id: string;
  sourcePodId: string;
  sourceAnchor: AnchorPosition;
  targetPodId: string;
  targetAnchor: AnchorPosition;
  triggerMode: TriggerMode;
  decideStatus: DecideStatus;
  decideReason: string | null;
  connectionStatus: ConnectionStatus;
  /** summaryModel 接受任意模型名稱（如 "sonnet"、"gpt-5.4"），由 service 層驗證 capability */
  summaryModel: string;
  /** aiDecideModel 僅允許 Claude 三選一 */
  aiDecideModel: AiDecideModelType;
}
