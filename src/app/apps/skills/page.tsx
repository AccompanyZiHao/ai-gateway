import SkillChart from "./chart";
import { fetchSkillsData } from "@/lib/skills/fetch";
import type { RankChange } from "@/lib/skills/types";
import { formatInstalls, formatDiff } from "@/lib/skills/utils";

export default async function SkillsPage() {
  const data = await fetchSkillsData();

  if (!data || !data.current) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950">
        <div className="text-center">
          <div className="mb-2 text-4xl">⚠</div>
          <p className="text-zinc-400">暂无数据</p>
          <p className="mt-1 text-sm text-zinc-600">
            skills-leaderboard 仓库可能尚未部署
          </p>
        </div>
      </div>
    );
  }

  const { current, history } = data;
  const { top30, diff, date } = current;

  // 建立 id → rankChange 映射
  const changeMap = new Map<string, RankChange>();
  for (const rc of diff.rankChanges) {
    changeMap.set(rc.id, rc);
  }

  // 新进榜的 id 集合（用 id 而非 name 匹配，避免同名误判）
  const newEntryIds = new Set(diff.newEntries.map((e) => `${e.source}/${e.name}`));

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800/50 bg-zinc-950/80 backdrop-blur-sm">
        <div className="mx-auto max-w-5xl px-6 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">
                <span className="text-emerald-400">Skills</span> Top30
              </h1>
              <p className="mt-1 text-sm text-zinc-500">
                每日追踪 skills.sh 排行榜变化
              </p>
            </div>
            <div className="text-right">
              <div className="font-mono text-sm text-zinc-400">{date}</div>
              <div className="mt-0.5 text-xs text-zinc-600">
                {top30.length} skills tracked
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8 space-y-8">
        {(diff.newEntries.length > 0 || diff.dropped.length > 0) && (
          <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {diff.newEntries.length > 0 && (
              <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4">
                <h3 className="mb-2 text-sm font-medium text-emerald-400">
                  新进榜
                </h3>
                <div className="space-y-1">
                  {diff.newEntries.map((entry) => (
                    <div
                      key={entry.name}
                      className="flex items-center justify-between text-sm"
                    >
                      <span className="text-zinc-300">{entry.name}</span>
                      <span className="font-mono text-emerald-400">
                        #{entry.rank}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {diff.dropped.length > 0 && (
              <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4">
                <h3 className="mb-2 text-sm font-medium text-red-400">
                  掉榜
                </h3>
                <div className="space-y-1">
                  {diff.dropped.map((entry) => (
                    <div
                      key={entry.name}
                      className="flex items-center justify-between text-sm"
                    >
                      <span className="text-zinc-300">{entry.name}</span>
                      <span className="font-mono text-red-400">
                        昨日#{entry.yesterdayRank}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        <section>
          <div className="overflow-x-auto rounded-lg border border-zinc-800/50">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800/50 bg-zinc-900/50">
                  <th className="px-4 py-3 text-left font-medium text-zinc-500">排名</th>
                  <th className="px-4 py-3 text-left font-medium text-zinc-500">变化</th>
                  <th className="px-4 py-3 text-left font-medium text-zinc-500">名称</th>
                  <th className="px-4 py-3 text-left font-medium text-zinc-500">说明</th>
                  <th className="px-4 py-3 text-left font-medium text-zinc-500">来源</th>
                  <th className="px-4 py-3 text-right font-medium text-zinc-500">安装量</th>
                  <th className="px-4 py-3 text-right font-medium text-zinc-500">增量</th>
                </tr>
              </thead>
              <tbody>
                {top30.map((skill) => {
                  const change = changeMap.get(skill.id);
                  const isNew = newEntryIds.has(`${skill.source}/${skill.name}`);

                  return (
                    <tr
                      key={skill.id}
                      className="border-b border-zinc-800/30 transition-colors hover:bg-zinc-900/30"
                    >
                      <td className="px-4 py-2.5">
                        <span className="font-mono text-zinc-400">
                          {String(skill.rank).padStart(2, "0")}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        {isNew ? (
                          <span className="text-xs font-medium text-emerald-400">NEW</span>
                        ) : change && change.change !== 0 ? (
                          <span
                            className={`font-mono text-xs ${
                              change.change > 0 ? "text-emerald-400" : "text-red-400"
                            }`}
                          >
                            {change.change > 0 ? "↑" : "↓"}
                            {Math.abs(change.change)}
                          </span>
                        ) : (
                          <span className="text-xs text-zinc-600">→</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <a
                            href={skill.url || `https://skills.sh/${skill.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-medium text-zinc-200 transition-colors hover:text-emerald-400"
                          >
                            {skill.name}
                          </a>
                          {skill.isOfficial && (
                            <span className="rounded bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-medium text-blue-400">
                              官方
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="max-w-xs truncate px-4 py-2.5 text-xs text-zinc-500" title={skill.description || ""}>
                        {skill.description || "-"}
                      </td>
                      <td className="px-4 py-2.5 text-zinc-500">{skill.source}</td>
                      <td className="px-4 py-2.5 text-right">
                        <span className="font-mono text-zinc-300">
                          {formatInstalls(skill.installs)}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {change && change.installsDiff !== 0 ? (
                          <span
                            className={`font-mono text-xs ${
                              change.installsDiff > 0
                                ? "text-emerald-400/80"
                                : "text-red-400/80"
                            }`}
                          >
                            {formatDiff(change.installsDiff)}
                          </span>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-lg border border-zinc-800/50 bg-zinc-900/30 p-6">
          <h2 className="mb-4 text-lg font-semibold text-zinc-200">安装趋势</h2>
          <SkillChart skills={top30} history={history} />
        </section>
      </main>
    </div>
  );
}
