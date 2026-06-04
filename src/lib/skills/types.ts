/** 当前 skill 条目 */
export interface SkillItem {
  rank: number;
  id: string;
  name: string;
  source: string;
  installs: number;
  weeklyInstalls?: number[];
  isOfficial?: boolean;
  url?: string;
  description?: string;
}

/** diff 中的排名变化条目 */
export interface RankChange {
  id: string;
  name: string;
  source: string;
  yesterday: number;
  today: number;
  change: number;
  installsDiff: number;
  todayInstalls: number;
}

/** 新进榜条目 */
export interface NewEntry {
  name: string;
  source: string;
  rank: number;
  installs: number;
}

/** 掉榜条目 */
export interface DroppedEntry {
  name: string;
  source: string;
  yesterdayRank: number;
  yesterdayInstalls: number;
}

/** 完整的 diff 数据 */
export interface DiffData {
  newEntries: NewEntry[];
  dropped: DroppedEntry[];
  rankChanges: RankChange[];
}

/** 最新数据（latest.json 结构） */
export interface LatestData {
  date: string;
  top30: SkillItem[];
  diff: DiffData;
}

/** 历史快照条目 */
export interface HistorySnapshot {
  date: string;
  top30: Array<{ id: string; name: string; installs: number }>;
}

/** API 返回的完整数据结构 */
export interface SkillsData {
  current: LatestData;
  history: HistorySnapshot[];
}
