import crypto from 'crypto';

/**
 * 企业微信回调消息加解密（WXBizMsgCrypt 最小实现）
 * 算法：AES-256-CBC，key = Base64Decode(EncodingAESKey + '=')，iv 取 key 前 16 字节
 * 密文明文结构：16 字节随机串 + 4 字节网络序消息长度 + 消息体 XML + receiveId（企业 corpid）
 */

/**
 * 企业微信签名校验：sha1(字典序排序 [token, timestamp, nonce, encrypted] 拼接)
 * 与测试号的验签算法一致，只是多了一个 encrypted 参数
 */
export function verifyWecomSignature(
  token: string,
  timestamp: string,
  nonce: string,
  encrypted: string,
  msgSignature: string,
): boolean {
  const computed = crypto
    .createHash('sha1')
    .update([token, timestamp, nonce, encrypted].sort().join(''))
    .digest('hex');
  return computed === msgSignature;
}

/**
 * 解密回调消息 / echostr
 * 返回解密出的 XML 明文和 receiveId（可用 corpid 做二次校验）
 */
export function decryptWecomMessage(
  encryptedBase64: string,
  encodingAESKey: string,
): { message: string; receiveId: string } {
  // key 规范：EncodingAESKey 是 43 位，补 '=' 凑成合法 Base64 后解出 32 字节密钥
  const key = Buffer.from(encodingAESKey + '=', 'base64');
  const iv = key.subarray(0, 16);

  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  // 关闭自动去填充：企业微信用的是 PKCS7 块长 32，Node 内置只支持 16，需手动去
  decipher.setAutoPadding(false);
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedBase64, 'base64')),
    decipher.final(),
  ]);

  // 手动去 PKCS7 填充（最后一字节值 = 填充长度）
  const pad = decrypted[decrypted.length - 1];
  const plain = decrypted.subarray(0, decrypted.length - pad);

  // 明文结构：16 随机 + 4 字节消息长度（网络序）+ 消息 + receiveId
  const msgLen = plain.readUInt32BE(16);
  const message = plain.subarray(20, 20 + msgLen).toString('utf8');
  const receiveId = plain.subarray(20 + msgLen).toString('utf8');
  return { message, receiveId };
}
