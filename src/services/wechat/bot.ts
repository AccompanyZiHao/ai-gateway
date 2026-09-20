import { WechatMessage } from '@/lib/wechat/types';
import { parseExpense, mapCategory } from '@/lib/wechat/accounting';
import {
  webdavConfigFromEnv,
  ensureDirectory,
  putFile,
  getFile,
} from '@/lib/webdav';

/**
 * 微信消息处理服务（双通道）
 * 管理员（WECHAT_ADMIN_OPENID）：全功能 — 消息进 ob vault 的 inbox/
 * 其他用户：仅记账 — 口语化记账（「早餐 12」）进 users/<openid>/accounting/，与管理员数据物理隔离
 */

// 模块级 access_token 缓存（serverless 实例存活期间复用，避免每次都刷新）
let cachedToken: { value: string; expiresAt: number } | null = null;

/**
 * 获取微信接口调用凭据（access_token），有效期 7200s，提前 5 分钟刷新
 */
async function getAccessToken(appId: string, appSecret: string): Promise<string | null> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.value;
  }
  const resp = await fetch(
    `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${appId}&secret=${appSecret}`,
  );
  const data = (await resp.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) {
    // 拿不到 token 是「完全不回复」的头号嫌疑，必须把微信返回的错误打出来
    console.error('[wechat] get token failed:', JSON.stringify(data));
    return null;
  }
  cachedToken = {
    value: data.access_token,
    expiresAt: Date.now() + ((data.expires_in ?? 7200) - 300) * 1000,
  };
  return cachedToken.value;
}

/**
 * 通过客服消息接口回复用户（被动回复受 5s 限制，统一走客服接口）
 * 注意：客服消息有 48h 窗口（用户发消息后），对自用场景足够
 */
async function replyText(toUser: string, content: string): Promise<void> {
  const appId = process.env.WECHAT_APP_ID;
  const appSecret = process.env.WECHAT_APP_SECRET;
  if (!appId || !appSecret) {
    return;
  }
  const token = await getAccessToken(appId, appSecret);
  if (!token) {
    return;
  }
  try {
    const resp = await fetch(
      `https://api.weixin.qq.com/cgi-bin/message/custom/send?access_token=${token}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          touser: toUser,
          msgtype: 'text',
          text: { content },
        }),
      },
    );
    // 微信接口正常 HTTP 200 也可能带 errcode（如 45009、40001），必须检查响应体
    const result = (await resp.json().catch(() => null)) as {
      errcode?: number;
      errmsg?: string;
    } | null;
    if (result?.errcode) {
      console.error('[wechat] reply err:', JSON.stringify(result));
    } else {
      console.log('[wechat] replied:', toUser);
    }
  } catch (err) {
    // 回复失败不影响入库，但错误要留痕（否则就是「完全不回」的无头案）
    console.error('[wechat] reply network error:', err);
  }
}

/**
 * 把消息组装成 inbox 条目的 markdown 内容
 * 属性格式对齐 ob vault 的 AGENTS.md 规范（create time + source）
 */
function buildMarkdown(msg: WechatMessage, time: Date): string {
  let body = '';

  if (msg.msgType === 'text') {
    body = msg.content ?? '';
  } else if (msg.msgType === 'voice') {
    // 语音：正文放识别文本，标注来源是语音
    body = `${msg.recognition ?? '（语音识别为空）'}\n\n> 🎤 语音输入`;
  } else if (msg.msgType === 'link') {
    // 链接：存为待读条目，正文提炼由周五分流时人工判断
    body = `[${msg.title ?? '无标题'}](${msg.url ?? ''})\n\n${msg.description ?? ''}\n\n> 🔗 链接待读`;
  }

  // 补零格式的本地时间字符串，与 vault 现有属性格式一致
  const pad = (n: number) => String(n).padStart(2, '0');
  const timeStr = `${time.getFullYear()}-${pad(time.getMonth() + 1)}-${pad(time.getDate())}  ${pad(time.getHours())}:${pad(time.getMinutes())}:${pad(time.getSeconds())}`;

  return `---
create time: ${timeStr}
source: wechat
---

${body}
`;
}

/**
 * 生成入库文件名：日期时间 + 消息id 后4位（防同秒冲突 + 可追溯）
 */
function buildFileName(msg: WechatMessage, time: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const dateStr = `${time.getFullYear()}-${pad(time.getMonth() + 1)}-${pad(time.getDate())}`;
  const timeStr = `${pad(time.getHours())}${pad(time.getMinutes())}${pad(time.getSeconds())}`;
  const suffix = msg.msgId ? `_${msg.msgId.slice(-4)}` : '';
  return `inbox/${dateStr}_${timeStr}${suffix}.md`;
}

/**
 * 非管理员通道：记账专用
 * 存储：users/<openid>/accounting/YYYY-MM.md（每人每月一个文件，追加一行一条）
 * 解析失败兜底：原样存储并在回复中提示格式
 */
async function processAccounting(msg: WechatMessage): Promise<void> {
  const config = webdavConfigFromEnv();
  if (!config) {
    await replyText(msg.fromUserName, '⚠️ 记账服务暂不可用（服务端未配置存储）');
    return;
  }

  // 记账只接受文字和语音（语音识别文本），链接/图片明确拒绝并提示用法
  const text =
    msg.msgType === 'text'
      ? msg.content
      : msg.msgType === 'voice'
        ? msg.recognition
        : undefined;
  if (!text) {
    await replyText(
      msg.fromUserName,
      '目前只开放记账功能：发「早餐 12」这样的文字或语音即可',
    );
    return;
  }

  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const month = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
  const timeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  // 路径按 openid 隔离，多用户数据互不交叉
  const dir = `users/${msg.fromUserName}/accounting`;
  const filePath = `${dir}/${month}.md`;

  const entry = parseExpense(text);
  // 解析失败：和管理员一样兜底进 inbox（标注来源 openid），由管理员周五统一处理
  if (!entry) {
    const ok = await writeInboxFallback(
      msg,
      '普通用户记账解析失败，未识别出金额',
      `原始记账文本：${text}`,
    );
    await replyText(
      msg.fromUserName,
      ok
        ? `已记下：${text}\n（没识别出金额，会由管理员整理入账）`
        : `已收到：${text}\n（没识别出金额，系统暂存失败，请稍后重发一次）`,
    );
    return;
  }

  const line = `- ${timeStr} ${entry.note} ¥${entry.amount}`;
  const reply = `✅ 已记：${entry.note} ¥${entry.amount}`;

  // 读-改-写：GET 旧文件（首次 404 则新建带头）→ 追加一行 → PUT 回去
  // 目录逐级创建（MKCOL 已存在返回 405 可忽略）
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
    console.log('[wechat] accounting saved:', filePath, line);
  }

  await replyText(
    msg.fromUserName,
    ok ? reply : '❌ 记账失败（存储异常），请稍后重试',
  );
}

/**
 * 兜底写入 inbox：任何「处理不了但不该丢」的消息都落到这里，由管理员周五分流处理
 * 文件内容标注来源 openid + 兜底原因，方便人工识别
 */
async function writeInboxFallback(
  msg: WechatMessage,
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
source: wechat
---

> ⚠️ 兜底入库（${reason}）
> 来源 openid：${msg.fromUserName}

${body}
`;
  await ensureDirectory(config, 'inbox');
  const ok = await putFile(config, fileName, content);
  if (ok) {
    // 兜底成功也留痕：能从日志直接看出这条消息走了兜底
    console.log('[wechat] fallback inbox saved:', fileName, `(${reason})`);
  }
  return ok;
}

/**
 * 管理员专用指令：#记 <事项> <金额>
 * 把记账写入「当日日志文件」（小组件的数据源），格式对齐 vault 既有数据：
 *   [餐饮:: 早餐 ¥12]
 * 路径规则与 vault 一致：log/{年}/{月} 月/{日期}.md（如 log/2026/9 月/2026-09-18.md）
 * 失败兜底：解析失败 / 当日日志不存在 → 转入 inbox 由管理员周五处理（2026-09-18 对齐结论）
 */
async function processAdminAccounting(
  msg: WechatMessage,
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

  // 读-改-写：追加到日志末尾（小组件记录也在这个位置）
  const existing = await getFile(config, filePath);
  if (existing === null) {
    // 当日日志未生成/未同步：同样兜底进 inbox，不擅自创建 stub（避免和模板生成冲突）
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
    console.log('[wechat] #记 saved to daily log:', filePath, line);
  }
  await replyText(
    msg.fromUserName,
    ok
      ? `✅ 已记：${entry.note} ¥${entry.amount} → ${category}（写入今日日志）`
      : '❌ 记账失败（存储异常），请稍后重试',
  );
}

/**
 * 处理一条微信消息（在 after() 中调用，不阻塞响应）
 */
export async function processWechatMessage(msg: WechatMessage): Promise<void> {
  // 每次记录发送者 openid 到 Vercel 日志，管理员首次配置 WECHAT_ADMIN_OPENID 时从这查
  console.log('[wechat] message from:', msg.fromUserName, 'type:', msg.msgType);

  const adminOpenid = process.env.WECHAT_ADMIN_OPENID;
  // 已配置管理员且发送者不是管理员 → 只能记账
  if (adminOpenid && msg.fromUserName !== adminOpenid) {
    await processAccounting(msg);
    return;
  }

  // 管理员专属：#记 指令优先于普通收集，直接写入当日日志（小组件数据源）
  const adminText =
    msg.msgType === 'text'
      ? msg.content
      : msg.msgType === 'voice'
        ? msg.recognition
        : undefined;
  if (adminText && adminText.startsWith('#记')) {
    await processAdminAccounting(msg, adminText);
    return;
  }

  const config = webdavConfigFromEnv();
  if (!config) {
    await replyText(msg.fromUserName, '⚠️ 收到，但服务端 WebDAV 未配置，条目暂未入库');
    return;
  }

  // 图片暂不支持下载转存，先明确告知（后续迭代加素材接口下载）
  if (msg.msgType === 'image') {
    await replyText(msg.fromUserName, '📷 图片收集还在开发中，先发文字/语音/链接吧');
    return;
  }

  // event 等非内容消息（如关注事件）不处理
  if (msg.msgType !== 'text' && msg.msgType !== 'voice' && msg.msgType !== 'link') {
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
    console.log('[wechat] inbox saved:', fileName);
    await replyText(msg.fromUserName, `✅ 已收录 → ${fileName}`);
    // 未配置管理员时，附带一次 openid 提示（配置后此提示不再出现，他人也看不到）
    if (!adminOpenid) {
      await replyText(
        msg.fromUserName,
        `🔧 管理员提示：你的 openid 是 ${msg.fromUserName}。配置环境变量 WECHAT_ADMIN_OPENID 后，其他人将只能使用记账功能`,
      );
    }
  } else {
    await replyText(msg.fromUserName, '❌ 入库失败（坚果云写入异常），请稍后重试');
  }
}
