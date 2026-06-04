/** 格式化安装量：1700000 → 1.7M */
export function formatInstalls(num: number): string {
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return String(num);
}

/** 格式化安装量增量：+5000 → +5K */
export function formatDiff(num: number): string {
  if (num === 0) return "";
  const sign = num > 0 ? "+" : "";
  if (Math.abs(num) >= 1_000_000)
    return `${sign}${(num / 1_000_000).toFixed(1)}M`;
  if (Math.abs(num) >= 1_000)
    return `${sign}${(num / 1_000).toFixed(0)}K`;
  return `${sign}${num}`;
}

/** 格式化日期：2026-05-28 → 05/28 */
export function formatDate(dateStr: string): string {
  const parts = dateStr.split("-");
  return `${parts[1]}/${parts[2]}`;
}
