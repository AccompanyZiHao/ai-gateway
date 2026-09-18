import { WechatMessage } from './types';

/**
 * 从 XML 中提取单个标签的值，兼容 <![CDATA[...]]> 包裹
 * 微信测试号的 XML 是扁平结构，用正则提取足够可靠，无需引入 xml 解析依赖
 */
function pick(xml: string, tag: string): string | undefined {
  const match = xml.match(
    new RegExp(`<${tag}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${tag}>`),
  );
  return match ? match[1] : undefined;
}

/**
 * 解析微信测试号推送的 XML 消息体
 */
export function parseWechatXml(xml: string): WechatMessage | null {
  const msgType = pick(xml, 'MsgType');
  const fromUserName = pick(xml, 'FromUserName');
  // 缺关键字段说明不是合法消息，直接丢弃
  if (!msgType || !fromUserName) {
    return null;
  }

  return {
    fromUserName,
    msgType,
    content: pick(xml, 'Content'),
    recognition: pick(xml, 'Recognition'),
    title: pick(xml, 'Title'),
    description: pick(xml, 'Description'),
    url: pick(xml, 'Url'),
    mediaId: pick(xml, 'MediaId'),
    msgId: pick(xml, 'MsgId'),
    createTime: pick(xml, 'CreateTime'),
  };
}
