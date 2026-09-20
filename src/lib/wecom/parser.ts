/**
 * 企业微信回调 XML 解析（解密后的明文）
 * 字段与测试号类似：FromUserName 这里是成员 userid（不是 openid）
 */

export interface WecomMessage {
  // 企业 corpid
  toUserName: string;
  // 发送者 userid（企业通讯录内唯一，比 openid 直观）
  fromUserName: string;
  msgType: string;
  content?: string;
  msgId?: string;
  agentId?: string;
}

/**
 * 正则提取 XML 字段（兼容 CDATA 包裹），解析失败返回 null
 */
export function parseWecomXml(xml: string): WecomMessage | null {
  const pick = (tag: string): string | undefined => {
    const match = xml.match(
      new RegExp(`<${tag}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${tag}>`),
    );
    return match?.[1];
  };

  const toUserName = pick('ToUserName');
  const fromUserName = pick('FromUserName');
  const msgType = pick('MsgType');
  if (!toUserName || !fromUserName || !msgType) {
    return null;
  }
  return {
    toUserName,
    fromUserName,
    msgType,
    content: pick('Content'),
    msgId: pick('MsgId'),
    agentId: pick('AgentID'),
  };
}
