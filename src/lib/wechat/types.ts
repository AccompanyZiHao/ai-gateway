// 微信测试号回调消息类型（当前只建模收集场景需要的字段）

export interface WechatMessage {
  // 发送者 openid（未来分享给他人时按此路由隔离）
  fromUserName: string;
  // 消息类型：text / voice / link / image / event 等
  msgType: string;
  // 文本内容（text 消息）
  content?: string;
  // 语音识别结果（voice 消息，需在测试号后台开启语音识别）
  recognition?: string;
  // 链接消息三件套
  title?: string;
  description?: string;
  url?: string;
  // 图片素材 ID（image 消息，暂不下载原文件）
  mediaId?: string;
  // 消息 ID，用于日志排查
  msgId?: string;
  // 消息创建时间（unix 秒）
  createTime?: string;
}
