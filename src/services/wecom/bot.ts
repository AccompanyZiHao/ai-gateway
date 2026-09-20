import { WecomMessage } from '@/lib/wecom/parser';
import { parseExpense, mapCategory } from '@/lib/wechat/accounting';
import {
  webdavConfigFromEnv,
  ensureDirectory,
  putFile,
  getFile,
} from '@/lib/webdav';

/**
 * 企业微信自建应用消息处理服务（被动回复版）
 * 管理员（WECOM_ADMIN_USERID）：全功能 — 消息进 ob vault 的 inbox/
 * 其他成员：仅记账 — 口语化记账进 users/<userid>/accounting/，数据物理隔离
 *
 * 回复方式：被动回复 — 处理完成后把回复文本返回给 route，由 route 加密后
 * 直接写在回调响应体里（5 秒窗口内），不调企业微信 API，因此不依赖可信 IP 白名单
 * （Vercel 出口 IP 不固定，主动发消息接口会 60020，2026-09-20 确认）
 */

/**
 * 把消息组装成 inbox 条目的 markdown 内容（格式对齐 vault 的 AGENTS.md 规范）
 */
function buildMarkdown(msg: WecomMessage, time: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const timeStr = `${time.getFullYear()}-${pad(time.getMonth() + 1)}-${pad(time.getDate())}  ${pad(time.getHours())}:${pad(time.getMinutes())}:${pad(time.getSeconds())}`;

  return `---
create time: ${timeStr}
source: wecom
---

${msg.content ?? ''}
`;
}

/**
 * 生成入库文件名：日期时间 + 消息id 后4位（防同秒冲突 + 可追溯）
 */
function buildFileName(msg: WecomMessage, time: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const dateStr = `${time.getFullYear()}-${pad(time.getMonth() + 1)}-${pad(time.getDate())}`;
  const timeStr = `${pad(time.getHours())}${pad(time.getMinutes())}${pad(time.getSeconds())}`;
  const suffix = msg.msgId ? `_${msg.msgId.slice(-4)}` : '';
  return `inbox/${dateStr}_${timeStr}${suffix}.md`;
}

/**
 * 兜底写入 inbox：任何「处理不了但不该丢」的消息都落到这里，由管理员周五分流处理
 * 文件内容标注来源 userid + 兜底原因，方便人工识别
 */
async function writeInboxFallback(
  msg: WecomMessage,
  reason: string,
  body: string,
): Promise<boolean> {
  const config = webdavConfigFromEnv();
  if (!config) {
    return false;
  }
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const timeStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}  ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  const fileName = buildFileName(msg, now);

  const content = `---
create time: ${timeStr}
source: wecom
---

> ⚠️ 兜底入库（${reason}）
> 来源 userid：${msg.fromUserName}

${body}
`;
  await ensureDirectory(config, 'inbox');
  const ok = await putFile(config, fileName, content);
  if (ok) {
    // 兜底成功也留痕：能从日志直接看出这条消息走了兜底
    console.log('[wecom] fallback inbox saved:', fileName, `(${reason})`);
  }
  return ok;
}

/**
 * 普通成员通道：记账专用
 * 存储：users/<userid>/accounting/YYYY-MM.md（每人每月一个文件，追加一行一条）
 */
async function processAccounting(msg: WecomMessage): Promise<string> {
  const config = webdavConfigFromEnv();
  if (!config) {
    return '⚠️ 记账服务暂不可用（服务端未配置存储）';
  }

  // 第一版只支持文字（语音格式与测试号不同，后续迭代）
  if (msg.msgType !== 'text' || !msg.content) {
    return '目前只开放记账功能：发「早餐 12」这样的文字即可';
  }

  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const month = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
  const timeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  // 路径按 userid 隔离，多用户数据互不交叉
  const dir = `users/${msg.fromUserName}/accounting`;
  const filePath = `${dir}/${month}.md`;

  const entry = parseExpense(msg.content);
  // 解析失败：和管理员一样兜底进 inbox（标注来源 userid），由管理员周五统一处理
  if (!entry) {
    const ok = await writeInboxFallback(
      msg,
      '普通用户记账解析失败，未识别出金额',
      `原始记账文本：${msg.content}`,
    );
    return ok
      ? `已记下：${msg.content}\n（没识别出金额，会由管理员整理入账）`
      : `已收到：${msg.content}\n（没识别出金额，系统暂存失败，请稍后重发一次）`;
  }

  const line = `- ${timeStr} ${entry.note} ¥${entry.amount}`;

  // 读-改-写：GET 旧文件（首次 404 则新建带头）→ 追加一行 → PUT 回去
  await ensureDirectory(config, 'users');
  await ensureDirectory(config, `users/${msg.fromUserName}`);
  await ensureDirectory(config, dir);

  const existing = await getFile(config, filePath);
  const header = `# 记账 ${month}\n\n`;
  const content = `${existing ?? header}${line}\n`;

  let ok = await putFile(config, filePath, content);
  if (!ok) {
    // 失败重试一次（坚果云偶发抖动）
    ok = await putFile(config, filePath, content);
  }
  if (ok) {
    // 成功也留痕：普通用户记账落盘位置
    console.log('[wecom] accounting saved:', filePath, line);
  }

  return ok ? `✅ 已记：${entry.note} ¥${entry.amount}` : '❌ 记账失败（存储异常），请稍后重试';
}

/**
 * 管理员专用指令：#记 <事项> <金额>
 * 写入当日日志（小组件数据源），格式 [大类:: 事项 ¥金额]
 * 路径规则与 vault 一致：log/{年}/{月} 月/{日期}.md（如 log/2026/9 月/2026-09-20.md）
 */
async function processAdminAccounting(
  msg: WecomMessage,
  rawText: string,
): Promise<string> {
  const config = webdavConfigFromEnv();
  if (!config) {
    return '⚠️ 记账服务暂不可用（服务端未配置存储）';
  }

  // 去掉 #记 前缀后解析
  const text = rawText.replace(/^#记\s*/, '').trim();
  const entry = parseExpense(text);
  if (!entry) {
    // 解析失败不丢弃：原文转 inbox，标注原因，等管理员人工处理
    const ok = await writeInboxFallback(
      msg,
      '#记 解析失败，未识别出金额',
      `原始记账文本：${text}`,
    );
    return ok
      ? `没识别出金额，已转入 inbox 待你处理：${text}`
      : `没识别出金额且兜底入库失败，请手动记录：${text}`;
  }

  const category = mapCategory(entry.note);
  const line = `[${category}:: ${entry.note} ¥${entry.amount}]`;

  // 当日日志路径（与 vault 的月度目录格式一致：「9 月」有空格）
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const filePath = `log/${now.getFullYear()}/${now.getMonth() + 1} 月/${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.md`;

  // 读-改-写：当日日志不存在 → 兜底进 inbox，不擅自创建 stub（避免和模板生成冲突）
  const existing = await getFile(config, filePath);
  if (existing === null) {
    const ok = await writeInboxFallback(
      msg,
      '#记 时当日日志不存在',
      `待入账内容：${line}\n原始文本：${text}`,
    );
    return ok
      ? `✅ 已记：${entry.note} ¥${entry.amount} → ${category}（今日日志未生成，暂存 inbox，同步后请挪入日志）`
      : `❌ 记账失败（今日日志不存在且兜底入库失败），请手动记录：${line}`;
  }

  const content = `${existing.replace(/\s*$/, '')}\n\n${line}\n`;
  const ok = await putFile(config, filePath, content);
  if (ok) {
    // 成功也留痕：管理员 #记 写入了哪个日志文件
    console.log('[wecom] #记 saved to daily log:', filePath, line);
  }
  return ok
    ? `✅ 已记：${entry.note} ¥${entry.amount} → ${category}（写入今日日志）`
    : '❌ 记账失败（存储异常），请稍后重试';
}

/**
 * 处理一条企业微信消息，返回被动回复的文本（route 负责加密写进响应体）
 * 返回空串表示不回复
 */
export async function processWecomMessage(msg: WecomMessage): Promise<string> {
  // 每次记录发送者 userid 到日志，首次配置 WECOM_ADMIN_USERID 时从这查
  console.log('[wecom] message from:', msg.fromUserName, 'type:', msg.msgType);

  const adminUserid = process.env.WECOM_ADMIN_USERID;
  // 已配置管理员且发送者不是管理员 → 只能记账
  if (adminUserid && msg.fromUserName !== adminUserid) {
    return processAccounting(msg);
  }

  // 管理员专属：#记 指令优先于普通收集，直接写入当日日志（小组件数据源）
  if (msg.msgType === 'text' && msg.content?.startsWith('#记')) {
    return processAdminAccounting(msg, msg.content);
  }

  const config = webdavConfigFromEnv();
  if (!config) {
    return '⚠️ 收到，但服务端 WebDAV 未配置，条目暂未入库';
  }

  // 第一版只收文字；语音/图片等明确告知（后续迭代）
  if (msg.msgType !== 'text') {
    return '目前先支持文字收集，语音/图片在路上';
  }

  const now = new Date();
  const fileName = buildFileName(msg, now);

  // 确保目录存在后写入（失败重试一次，坚果云偶发抖动）
  await ensureDirectory(config, 'inbox');
  let ok = await putFile(config, fileName, buildMarkdown(msg, now));
  if (!ok) {
    await ensureDirectory(config, 'inbox');
    ok = await putFile(config, fileName, buildMarkdown(msg, now));
  }

  if (!ok) {
    return '❌ 入库失败（坚果云写入异常），请稍后重试';
  }

  // 成功也留痕：收集消息落盘的文件名
  console.log('[wecom] inbox saved:', fileName);
  // 未配置管理员时，附带一次 userid 提示（配置后此提示不再出现）
  if (!adminUserid) {
    return `✅ 已收录 → ${fileName}\n🔧 管理员提示：你的 userid 是 ${msg.fromUserName}。配置环境变量 WECOM_ADMIN_USERID 后，其他成员将只能使用记账功能`;
  }
  return `✅ 已收录 → ${fileName}`;
}
