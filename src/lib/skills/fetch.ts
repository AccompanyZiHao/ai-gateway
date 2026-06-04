import type { SkillsData, HistorySnapshot } from "./types";

const LATEST_URL =
  "https://raw.githubusercontent.com/AccompanyZiHao/skills-leaderboard/main/data/latest.json";
const DATES_URL =
  "https://raw.githubusercontent.com/AccompanyZiHao/skills-leaderboard/main/data/dates.json";
const SNAPSHOT_BASE =
  "https://raw.githubusercontent.com/AccompanyZiHao/skills-leaderboard/main/data/snapshots";

/** 获取 skills 数据（当前数据 + 最近 7 天历史快照） */
export async function fetchSkillsData(): Promise<SkillsData | null> {
  // 并行获取最新数据和日期索引
  const [latestResp, datesResp] = await Promise.all([
    fetch(LATEST_URL, { next: { revalidate: 3600 } }),
    fetch(DATES_URL, { next: { revalidate: 3600 } }),
  ]);

  if (!latestResp.ok) return null;

  const current = await latestResp.json();
  let history: HistorySnapshot[] = [];

  if (datesResp.ok) {
    const dates: string[] = await datesResp.json();
    // 取最近 7 天（不含今天）
    const recentDates = dates.slice(-8, -1);

    if (recentDates.length > 0) {
      const snapshots = await Promise.all(
        recentDates.map(async (date): Promise<HistorySnapshot | null> => {
          try {
            const resp = await fetch(`${SNAPSHOT_BASE}/${date}.json`, {
              next: { revalidate: 3600 },
            });
            if (!resp.ok) return null;
            const data = await resp.json();
            return { date, top30: data };
          } catch {
            return null;
          }
        })
      );

      history = snapshots.filter(
        (r): r is HistorySnapshot => r !== null
      );
    }
  }

  return { current, history };
}
