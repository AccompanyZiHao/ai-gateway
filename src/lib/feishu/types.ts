// 飞书事件回调请求体类型
export interface FeishuEventRequest {
  schema?: string;
  header?: {
    event_id?: string;
    event_type?: string;
    create_time?: string;
    token?: string;
    app_id?: string;
    tenant_key?: string;
  };
  event?: {
    sender?: {
      sender_id?: {
        union_id?: string;
        user_id?: string;
        open_id?: string;
      };
      sender_type?: string;
      tenant_key?: string;
    };
    message?: {
      message_id?: string;
      root_id?: string;
      parent_id?: string;
      create_time?: string;
      chat_id?: string;
      chat_type?: string;
      message_type?: string;
      content?: string;
    };
  };
  // url_verification challenge
  challenge?: string;
  token?: string;
  type?: string;
}

// 解析后的消息
export interface ParsedMessage {
  chatId: string;
  messageId: string;
  userId: string;
  text: string;
}
