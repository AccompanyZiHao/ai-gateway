import { WechatMessage } from '@/lib/wechat/types';
import {
  webdavConfigFromEnv,
  ensureDirectory,
  putFile,
} from '@/lib/webdav';

/**
 * 微信消息 → Obsidian inbox 收集服务
 * 职责：把 text/voice/link 消息组装成带属性的 md，写入坚果云 WebDAV 的 inbox/ 目录，
 * 再通过客服消息回复确认。数据落地后由 Mac 端 Remotely Save 定时拉取进本地 vault
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
  await fetch(
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
  ).catch(() => {
    // 回复失败不影响入库，静默即可
  });
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
 * 处理一条微信消息（在 after() 中调用，不阻塞响应）
 */
export async function processWechatMessage(msg: WechatMessage): Promise<void> {
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
    await replyText(msg.fromUserName, `✅ 已收录 → ${fileName}`);
  } else {
    await replyText(msg.fromUserName, '❌ 入库失败（坚果云写入异常），请稍后重试');
  }
}
