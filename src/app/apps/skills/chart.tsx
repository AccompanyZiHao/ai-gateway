"use client";

import { useMemo, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import type { SkillItem, HistorySnapshot } from "@/lib/skills/types";
import { formatInstalls, formatDate } from "@/lib/skills/utils";

interface SkillChartProps {
  skills: SkillItem[];
  history: HistorySnapshot[];
}

export default function SkillChart({ skills, history }: SkillChartProps) {
  const [selectedId, setSelectedId] = useState<string>(
    skills[0]?.id || ""
  );

  const selectedSkill = skills.find((s) => s.id === selectedId);

  // 构建趋势数据，优先用 weeklyInstalls，其次从历史快照提取
  const trendData = useMemo(() => {
    if (!selectedSkill) return [];

    if (
      selectedSkill.weeklyInstalls &&
      selectedSkill.weeklyInstalls.length > 0
    ) {
      const today = new Date();
      return selectedSkill.weeklyInstalls.map((installs, i) => {
        const offset = selectedSkill.weeklyInstalls!.length - 1 - i;
        const d = new Date(today);
        d.setDate(d.getDate() - offset);
        return { date: d.toISOString().split("T")[0], installs };
      });
    }

    if (history.length > 0) {
      return history
        .map((snapshot) => {
          const skill = snapshot.top30.find((s) => s.id === selectedId);
          return { date: snapshot.date, installs: skill?.installs || 0 };
        })
        .filter((d) => d.installs > 0);
    }

    return [];
  }, [selectedSkill, selectedId, history]);

  if (!selectedSkill) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <label
          htmlFor="skill-select"
          className="text-sm font-medium text-zinc-400"
        >
          查看趋势
        </label>
        <select
          id="skill-select"
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          className="rounded-md border border-zinc-700 bg-zinc-800/50 px-3 py-1.5 text-sm text-zinc-200 outline-none transition-colors focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20"
        >
          {skills.map((skill) => (
            <option key={skill.id} value={skill.id}>
              {skill.name}
            </option>
          ))}
        </select>
      </div>

      {trendData.length > 1 ? (
        <div className="h-48 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trendData}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="#27272a"
                vertical={false}
              />
              <XAxis
                dataKey="date"
                tickFormatter={formatDate}
                stroke="#52525b"
                tick={{ fill: "#71717a", fontSize: 12 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tickFormatter={formatInstalls}
                stroke="#52525b"
                tick={{ fill: "#71717a", fontSize: 12 }}
                axisLine={false}
                tickLine={false}
                width={50}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#18181b",
                  border: "1px solid #27272a",
                  borderRadius: "6px",
                  fontSize: "12px",
                  color: "#e4e4e7",
                }}
                labelFormatter={(label) => formatDate(String(label))}
                formatter={(value) => [
                  formatInstalls(Number(value)),
                  "日安装量",
                ]}
              />
              <Line
                type="monotone"
                dataKey="installs"
                stroke="#10b981"
                strokeWidth={2}
                dot={{ r: 3, fill: "#10b981", stroke: "#10b981" }}
                activeDot={{
                  r: 5,
                  fill: "#10b981",
                  stroke: "#064e3b",
                  strokeWidth: 2,
                }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="py-8 text-center text-sm text-zinc-500">
          暂无足够历史数据生成趋势图（需连续运行 2 天以上）
        </p>
      )}
    </div>
  );
}
