/**
 * 坚果云 WebDAV 客户端（最小实现，只做 PUT 写入）
 * 认证方式：Basic Auth（坚果云账号 + 应用密码，应用密码在网页端「账户信息-安全选项」生成）
 */

interface WebdavConfig {
  // WebDAV 根地址，如 https://dav.jianguoyun.com/dav/obsidian-sync
  baseUrl: string;
  user: string;
  password: string;
}

function authHeader(config: WebdavConfig): string {
  return `Basic ${Buffer.from(`${config.user}:${config.password}`).toString('base64')}`;
}

/**
 * 确保父目录存在（MKCOL），已存在时报 405 可忽略
 * 坚果云 PUT 不会自动创建多级目录，需要先建目录
 */
export async function ensureDirectory(
  config: WebdavConfig,
  dirPath: string,
): Promise<void> {
  await fetch(`${config.baseUrl}/${dirPath}`, {
    method: 'MKCOL',
    headers: { Authorization: authHeader(config) },
  }).catch(() => {
    // 网络失败不阻塞 PUT（目录大概率已存在），让 PUT 自己去报错
  });
}

/**
 * 写入一个文本文件，返回是否成功
 */
export async function putFile(
  config: WebdavConfig,
  filePath: string,
  content: string,
): Promise<boolean> {
  const resp = await fetch(`${config.baseUrl}/${filePath}`, {
    method: 'PUT',
    headers: {
      Authorization: authHeader(config),
      'Content-Type': 'text/markdown; charset=utf-8',
    },
    body: content,
  });
  return resp.ok;
}

/**
 * 从环境变量读取 WebDAV 配置，缺失时返回 null（调用方决定如何降级）
 */
export function webdavConfigFromEnv(): WebdavConfig | null {
  const baseUrl = process.env.WEBDAV_BASE;
  const user = process.env.WEBDAV_USER;
  const password = process.env.WEBDAV_PASSWORD;
  if (!baseUrl || !user || !password) {
    return null;
  }
  return { baseUrl: baseUrl.replace(/\/+$/, ''), user, password };
}
