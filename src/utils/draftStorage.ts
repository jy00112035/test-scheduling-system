const DRAFT_KEY_PREFIX = 'demand_draft_';
const DRAFT_TIMESTAMP_KEY = 'demand_draft_timestamp_';

export interface DraftData {
  formData: Record<string, any>;
  manpowerInputs: Record<string, number>;
  manpowerRemarks: Record<string, string>;
  timestamp: number;
}

/**
 * 保存草稿到 localStorage
 */
export function saveDraft(draftId: string, data: Omit<DraftData, 'timestamp'>): void {
  try {
    const draft: DraftData = {
      ...data,
      timestamp: Date.now(),
    };
    localStorage.setItem(DRAFT_KEY_PREFIX + draftId, JSON.stringify(draft));
    localStorage.setItem(DRAFT_TIMESTAMP_KEY + draftId, String(draft.timestamp));
  } catch (error) {
    console.warn('保存草稿失败:', error);
  }
}

/**
 * 读取草稿
 */
export function getDraft(draftId: string): DraftData | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY_PREFIX + draftId);
    if (!raw) return null;
    return JSON.parse(raw) as DraftData;
  } catch (error) {
    console.warn('读取草稿失败:', error);
    return null;
  }
}

/**
 * 清除指定草稿
 */
export function clearDraft(draftId: string): void {
  localStorage.removeItem(DRAFT_KEY_PREFIX + draftId);
  localStorage.removeItem(DRAFT_TIMESTAMP_KEY + draftId);
}

/**
 * 获取草稿时间戳（用于显示"草稿来自 X 分钟前"）
 */
export function getDraftTimestamp(draftId: string): number | null {
  const ts = localStorage.getItem(DRAFT_TIMESTAMP_KEY + draftId);
  return ts ? Number(ts) : null;
}

/**
 * 格式化草稿时间
 */
export function formatDraftTime(timestamp: number): string {
  const minutes = Math.floor((Date.now() - timestamp) / 60000);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  return `${Math.floor(hours / 24)} 天前`;
}
