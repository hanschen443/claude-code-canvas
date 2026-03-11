import type { Component } from 'vue'

// ========== 連線狀態 ==========
export type IntegrationConnectionStatus = 'connected' | 'disconnected' | 'error'

// ========== 表單欄位定義 ==========
export interface FormFieldDefinition {
  key: string
  label: string
  placeholder: string
  type: 'text' | 'password'
  validate: (value: string) => string
}

// ========== 資源（第二步選擇的項目） ==========
export interface IntegrationResource {
  id: string | number
  label: string
}

// ========== 綁定時的額外欄位 ==========
export interface BindingExtraFieldDefinition {
  key: string
  label: string
  type: 'radio'
  options: Array<{ value: string; label: string }>
  defaultValue: string
}

// ========== 連線狀態樣式 ==========
export interface ConnectionStatusStyle {
  dotClass: string
  bg: string
  label: string
}

// ========== Integration App 統一介面 ==========
export interface IntegrationApp {
  id: string
  name: string
  connectionStatus: IntegrationConnectionStatus
  provider: string
  resources: IntegrationResource[]
  raw: Record<string, unknown>
}

// ========== Pod Integration Binding 統一介面 ==========
export interface IntegrationBinding {
  provider: string
  appId: string
  resourceId: string
  extra: Record<string, unknown>
}

// ========== Provider Config ==========
export interface IntegrationProviderConfig {
  name: string
  label: string
  icon: Component
  description: string

  createFormFields: FormFieldDefinition[]
  resourceLabel: string
  emptyResourceHint: string
  emptyAppHint: string
  bindingExtraFields?: BindingExtraFieldDefinition[]

  connectionStatusConfig: Record<IntegrationConnectionStatus, ConnectionStatusStyle>

  transformApp: (rawApp: Record<string, unknown>) => IntegrationApp
  getResources: (app: IntegrationApp) => IntegrationResource[]
  buildCreatePayload: (formValues: Record<string, string>) => Record<string, unknown>
  buildDeletePayload: (appId: string) => Record<string, unknown>
  buildBindPayload: (appId: string, resourceId: string, extra: Record<string, unknown>) => Record<string, unknown>

  hasManualResourceInput?: (extra: Record<string, unknown>) => boolean
  manualResourceInputConfig?: {
    label: string
    placeholder: string
    hint: string
    validate: (value: string) => string
  }
}
