import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 函数部署区域改到新加坡：缩短微信腾讯机房 → Vercel 的跨境链路，降低推送超时丢消息的概率
  // （默认 pdx1 美西，跨境到美西链路长、高峰期丢包导致微信回调间歇性失败 2026-09-20）
  experimental: {
    region: "sin1",
  },
};

export default nextConfig;
