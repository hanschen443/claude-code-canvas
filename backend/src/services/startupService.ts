import { promises as fs } from 'fs';
import { scheduleService } from './scheduleService.js';
import { canvasStore } from './canvasStore.js';
import { Result, ok, err } from '../types';
import { config } from '../config';
import { logger } from '../utils/logger.js';
import type { LogCategory } from '../utils/logger.js';
import { slackAppStore } from './slack/slackAppStore.js';
import { slackClientManager } from './slack/slackClientManager.js';
import { telegramBotStore } from './telegram/telegramBotStore.js';
import { telegramClientManager } from './telegram/telegramClientManager.js';
import { jiraAppStore } from './jira/jiraAppStore.js';
import { jiraClientManager } from './jira/jiraClientManager.js';
import './telegram/telegramEventService.js';
import { getDb } from '../database/index.js';

class StartupService {
  async initialize(): Promise<Result<void>> {
    const dirResult = await this.ensureDirectories([
      config.appDataRoot,
      config.canvasRoot,
      config.repositoriesRoot,
    ]);
    if (!dirResult.success) {
      return dirResult;
    }

    getDb();

    const canvases = canvasStore.list();
    if (canvases.length === 0) {
      logger.log('Startup', 'Create', '未找到任何畫布，建立預設畫布');
      const defaultCanvasResult = await canvasStore.create('default');
      if (!defaultCanvasResult.success) {
        return err(`建立預設 Canvas 失敗: ${defaultCanvasResult.error}`);
      }
    }

    scheduleService.start();

    this.restoreSlackConnections().catch((error) => {
      logger.error('Slack', 'Error', '[StartupService] Slack 連線恢復時發生非預期錯誤', error);
    });

    this.restoreTelegramConnections().catch((error) => {
      logger.error('Telegram', 'Error', '[StartupService] Telegram 連線恢復時發生非預期錯誤', error);
    });

    this.restoreJiraConnections().catch((error) => {
      logger.error('Jira', 'Error', '[StartupService] Jira 連線恢復時發生非預期錯誤', error);
    });

    logger.log('Startup', 'Complete', '伺服器初始化完成');
    return ok(undefined);
  }

  private async ensureDirectories(paths: string[]): Promise<Result<void>> {
    for (const dirPath of paths) {
      try {
        await fs.mkdir(dirPath, {recursive: true});
      } catch {
        return err(`伺服器初始化失敗: 建立目錄 ${dirPath} 失敗`);
      }
    }
    return ok(undefined);
  }

  private async restoreConnections<T extends {name: string}>(
    items: T[],
    initFn: (item: T) => Promise<void>,
    category: LogCategory,
    label: string,
  ): Promise<void> {
    if (items.length === 0) return;

    logger.log(category, 'Load', `[StartupService] 開始恢復 ${items.length} 個 ${label} 連線`);

    const results = await Promise.allSettled(items.map((item) => initFn(item)));

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.status === 'rejected') {
        logger.error(category, 'Error', `[StartupService] ${label}「${items[i].name}」初始化恢復失敗`, result.reason);
      }
    }

    logger.log(category, 'Complete', `[StartupService] ${label} 初始化恢復完成`);
  }

  private async restoreSlackConnections(): Promise<void> {
    await this.restoreConnections(
      slackAppStore.list(),
      (app) => slackClientManager.initialize(app),
      'Slack',
      'Slack App',
    );
  }

  private async restoreTelegramConnections(): Promise<void> {
    await this.restoreConnections(
      telegramBotStore.list(),
      (bot) => telegramClientManager.initialize(bot),
      'Telegram',
      'Telegram Bot',
    );
  }

  private async restoreJiraConnections(): Promise<void> {
    await this.restoreConnections(
      jiraAppStore.list(),
      (app) => jiraClientManager.initialize(app),
      'Jira',
      'Jira App',
    );
  }
}

export const startupService = new StartupService();
