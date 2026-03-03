import { simpleGit } from 'simple-git';
import { Result, ok, err } from '../types';
import { logger, type LogCategory } from './logger.js';

export async function gitOperation<T>(
  operation: () => Promise<T>,
  errorContext: string
): Promise<Result<T>> {
  try {
    const data = await operation();
    return ok(data);
  } catch (error) {
    logger.error('Git', 'Error', `[Git] ${errorContext}`, error);
    return err(errorContext);
  }
}

export async function gitOperationWithPath<T>(
  workspacePath: string,
  operation: (git: ReturnType<typeof simpleGit>) => Promise<T>,
  errorContext: string
): Promise<Result<T>> {
  return gitOperation(() => operation(simpleGit(workspacePath)), errorContext);
}

export function resultOrDefault<T>(result: Result<T>, defaultValue: T): Result<T> {
  if (!result.success || result.data === undefined) {
    return ok(defaultValue);
  }
  return ok(result.data);
}

export async function fsOperation<T>(
  operation: () => Promise<T>,
  errorContext: string
): Promise<Result<T>> {
  try {
    const data = await operation();
    return ok(data);
  } catch (error) {
    logger.error('Workspace', 'Error', `[FS] ${errorContext}`, error);
    return err(errorContext);
  }
}

export function getGitStageMessage(stage: string): string {
  const stageMessages: Record<string, string> = {
    counting: '計算物件數量...',
    compressing: '壓縮物件...',
    receiving: '接收物件...',
    resolving: '解析差異...',
    writing: '寫入物件...',
  };

  return stageMessages[stage] ?? '處理中...';
}

export function fireAndForget(promise: Promise<unknown>, category: LogCategory, errorContext: string): void {
  promise.catch((error) => {
    logger.error(category, 'Error', errorContext, error);
  });
}

