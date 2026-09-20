import { WecomMessage } from '@/lib/wecom/parser';
import { parseExpense, mapCategory } from '@/lib/wechat/accounting';
import {
  webdavConfigFromEnv,
  ensureDirectory,
  putFile,
  getFile,
} from '@/lib/webdav';

/**
 * 企业微信自建应用消息处理服务（双通道，逻辑对齐测试号版 bot.ts）
 * 管理员（WECOM_ADMIN_USERID）：全功能 — 消息进 ob vault 的 inbox/
 * 其他成员：仅记账 — 口语化记账进 users/<userid>/accounting/，数据物理隔离
 * 业务逻辑（解析/分类/入库/兜底）与测试号版完全复用，仅收发消息层不同
 */

// 模块级 access_token 缓存（企业微信 token 有效期 7200s，提前 5 分钟刷新）
let cachedToken: { value: string; expiresAt: number } | null = null;

/**
 * 获取企业微信接口调用凭据：corpid + 应用 secret 换 access_token
 */
async function getAccessToken(): Promise<string | null> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.value;
  }
  const corpId = process.env.WECOM_CORP_ID;
  const secret = process.env.WECOM_AGENT_SECRET;
  if (!corpId || !secret) {
    console.error('[wecom] reply skipped: WECOM_CORP_ID / WECOM_AGENT_SECRET 未配置');
    return null;
  }
  const resp = await fetch(
    `https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${corpId}&corpsecret=${secret}`,
  );
  const data = (await resp.json()) as { access_token?: string; expires_in?: number; errcode?: number };
  if (!data.access_token) {
    // 拿不到 token 是「完全不回复」的头号嫌疑，必须把错误打出来
    console.error('[wecom] get token failed:', JSON.stringify(data));
    return null;
  }
  cachedToken = {
    value: data.access_token,
    expiresAt: Date.now() + ((data.expires_in ?? 7200) - 300) * 1000,
  };
  return cachedToken.value;
}

/**
 * 通过应用消息接口回复成员（企业微信无「客服消息 48h 窗口」限制，进企业即可收）
 */
async function replyText(toUser: string, content: string): Promise<void> {
  const agentId = process.env.WECOM_AGENT_ID;
  if (!agentId) {
    console.error('[wecom] reply skipped: WECOM_AGENT_ID 未配置');
    return;
  }
  const token = await getAccessToken();
  if (!token) {
    return;
  }
  try {
    const resp = await fetch(
      `https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=${token}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          touser: toUser,
          msgtype: 'text',
          agentid: Number(agentId),
          text: { content },
        }),
      },
    );
    // 企业微信正常也可能带 errcode（如 60011 无权限），必须检查响应体
    const result = (await resp.json().catch(() => null)) as {
      errcode?: number;
      errmsg?: string;
    } | null;
    if (result?.errcode) {
      console.error('[wecom] reply err:', JSON.stringify(result));
    } else {
      console.log('[wecom] replied:', toUser);
    }
  } catch (err) {
    // 回复失败不影响入库，但错误要留痕（否则就是「完全不回」的无头案）
    console.error('[wecom] reply network error:', err);
  }
}

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
async function processAccounting(msg: WecomMessage): Promise<void> {
  const config = webdavConfigFromEnv();
  if (!config) {
    await replyText(msg.fromUserName, '⚠️ 记账服务暂不可用（服务端未配置存储）');
    return;
  }

  // 第一版只支持文字（语音格式与测试号不同，后续迭代）
  if (msg.msgType !== 'text' || !msg.content) {
    await replyText(msg.fromUserName, '目前只开放记账功能：发「早餐 12」这样的文字即可');
    return;
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
    await replyText(
      msg.fromUserName,
      ok
        ? `已记下：${msg.content}\n（没识别出金额，会由管理员整理入账）`
        : `已收到：${msg.content}\n（没识别出金额，系统暂存失败，请稍后重发一次）`,
    );
    return;
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

  await replyText(
    msg.fromUserName,
    ok ? `✅ 已记：${entry.note} ¥${entry.amount}` : '❌ 记账失败（存储异常），请稍后重试',
  );
}

/**
 * 管理员专用指令：#记 <事项> <金额>
 * 写入当日日志（小组件数据源），格式 [大类:: 事项 ¥金额]
 * 路径规则与 vault 一致：log/{年}/{月} 月/{日期}.md（如 log/2026/9 月/2026-09-20.md）
 */
async function processAdminAccounting(
  msg: WecomMessage,
  rawText: string,
): Promise<void> {
  const config = webdavConfigFromEnv();
  if (!config) {
    await replyText(msg.fromUserName, '⚠️ 记账服务暂不可用（服务端未配置存储）');
    return;
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
    await replyText(
      msg.fromUserName,
      ok
        ? `没识别出金额，已转入 inbox 待你处理：${text}`
        : `没识别出金额且兜底入库失败，请手动记录：${text}`,
    );
    return;
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
    await replyText(
      msg.fromUserName,
      ok
        ? `✅ 已记：${entry.note} ¥${entry.amount} → ${category}（今日日志未生成，暂存 inbox，同步后请挪入日志）`
        : `❌ 记账失败（今日日志不存在且兜底入库失败），请手动记录：${line}`,
    );
    return;
  }

  const content = `${existing.replace(/\s*$/, '')}\n\n${line}\n`;
  const ok = await putFile(config, filePath, content);
  if (ok) {
    // 成功也留痕：管理员 #记 写入了哪个日志文件
    console.log('[wecom] #记 saved to daily log:', filePath, line);
  }
  await replyText(
    msg.fromUserName,
    ok
      ? `✅ 已记：${entry.note} ¥${entry.amount} → ${category}（写入今日日志）`
      : '❌ 记账失败（存储异常），请稍后重试',
  );
}

/**
 * 处理一条企业微信消息（在 after() 中调用，不阻塞响应）
 */
export async function processWecomMessage(msg: WecomMessage): Promise<void> {
  // 每次记录发送者 userid 到日志，首次配置 WECOM_ADMIN_USERID 时从这查
  console.log('[wecom] message from:', msg.fromUserName, 'type:', msg.msgType);

  const adminUserid = process.env.WECOM_ADMIN_USERID;
  // 已配置管理员且发送者不是管理员 → 只能记账
  if (adminUserid && msg.fromUserName !== adminUserid) {
    await processAccounting(msg);
    return;
  }

  // 管理员专属：#记 指令优先于普通收集，直接写入当日日志（小组件数据源）
  if (msg.msgType === 'text' && msg.content?.startsWith('#记')) {
    await processAdminAccounting(msg, msg.content);
    return;
  }

  const config = webdavConfigFromEnv();
  if (!config) {
    await replyText(msg.fromUserName, '⚠️ 收到，但服务端 WebDAV 未配置，条目暂未入库');
    return;
  }

  // 第一版只收文字；语音/图片等明确告知（后续迭代）
  if (msg.msgType !== 'text') {
    await replyText(msg.fromUserName, '目前先支持文字收集，语音/图片在路上');
    return;
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

  if (ok) {
    // 成功也留痕：收集消息落盘的文件名
    console.log('[wecom] inbox saved:', fileName);
    await replyText(msg.fromUserName, `✅ 已收录 → ${fileName}`);
    // 未配置管理员时，附带一次 userid 提示（配置后此提示不再出现）
    if (!adminUserid) {
      await replyText(
        msg.fromUserName,
        `🔧 管理员提示：你的 userid 是 ${msg.fromUserName}。配置环境变量 WECOM_ADMIN_USERID 后，其他成员将只能使用记账功能`,
      );
    }
  } else {
    await replyText(msg.fromUserName, '❌ 入库失败（坚果云写入异常），请稍后重试');
  }
}
