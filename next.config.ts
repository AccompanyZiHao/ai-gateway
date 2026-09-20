import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // 函数区域不能在这里配（Next 16 已移除 experimental.region）
  // 改区域走 Vercel 控制台：Settings → Functions → Function Region → Singapore (sin1)
};

export default nextConfig;
