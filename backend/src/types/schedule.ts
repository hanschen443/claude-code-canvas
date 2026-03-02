export type ScheduleFrequency =
  | 'every-second'
  | 'every-x-minute'
  | 'every-x-hour'
  | 'every-day'
  | 'every-week';

export interface ScheduleConfigInput {
  frequency: ScheduleFrequency;
  second: number;
  intervalMinute: number;
  intervalHour: number;
  hour: number;
  minute: number;
  weekdays: number[];
  enabled: boolean;
}

export interface ScheduleConfig extends ScheduleConfigInput {
  lastTriggeredAt: Date | null;
}

export interface PersistedScheduleConfig {
  frequency: ScheduleFrequency;
  second: number;
  intervalMinute: number;
  intervalHour: number;
  hour: number;
  minute: number;
  weekdays: number[];
  enabled: boolean;
  lastTriggeredAt: string | null;
}
