/**
 * 记账消息解析器：从口语化文本中提取「事项 + 金额」
 * 支持：「早餐 12」「打车35块」「午饭 32.5 元」「¥15 咖啡」
 * 解析不出金额时返回 null，调用方兜底原样存储
 */

export interface ExpenseEntry {
  // 事项描述（去掉金额后的剩余文本）
  note: string;
  // 金额（元）
  amount: number;
}

/**
 * 解析记账文本
 * 匹配第一个数字作为金额（带 ¥/元/块 单位词优先识别），其余文本作为事项
 */
export function parseExpense(text: string): ExpenseEntry | null {
  // 金额可出现在任意位置，允许小数（最多两位），可带 ¥/元/块 单位
  const match = text.match(/(\d+(?:\.\d{1,2})?)\s*(?:元|块|¥|￥)?/);
  if (!match) {
    return null;
  }

  const amount = parseFloat(match[1]);
  // 防御：金额为 0 或非法值时不算有效记账
  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }

  // 剩余文本去掉金额和单位词后作为事项名
  const note = text
    .replace(match[0], '')
    .replace(/[¥￥元块]/g, '')
    .trim();

  return { note: note || '未分类', amount };
}

/**
 * 事项 → 记账大类映射
 * 大类清单来自 vault 记账小组件 V5.5 的真实配置（12 个支出类）：
 * 餐饮/交通/住房/日用/服饰/数码/娱乐/社交/旅行/学习/运动/医疗/其他
 * 关键词按常见事项配置，命中即归类；都不命中归「其他」（组件真实分类）
 */
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  餐饮: [
    '早餐', '午餐', '晚餐', '午饭', '晚饭', '夜宵', '外卖', '咖啡', '奶茶',
    '水果', '零食', '饭', '面', '粉', '麻辣烫', '饺子', '凉菜', '饮品',
    '牛奶', '面包', '烧烤', '火锅', '食堂', '吃',
  ],
  交通: ['打车', '地铁', '公交', '滴滴', '出租车', '加油', '停车', '高铁', '火车', '机票', '单车', '过路费'],
  住房: ['房租', '租金', '水电', '物业', '燃气', '宽带', '房贷'],
  日用: ['话费', '纸巾', '洗发', '洗衣', '牙膏', '理发', '快递', '日用'],
  服饰: ['衣服', '裤', '鞋', '帽', '袜', '外套', '内衣'],
  数码: ['耳机', '键盘', '鼠标', '手机', '电脑', '充电', '数据线', '平板', '相机'],
  娱乐: ['电影', '游戏', '会员', '门票', '演出', 'KTV', '酒吧'],
  社交: ['请客', '聚餐', '礼物', '红包', '份子'],
  旅行: ['酒店', '民宿', '旅游', '旅行', '景区'],
  学习: ['书', '课程', '培训', '学习', '考试', '极客'],
  运动: ['健身', '游泳', '球', '瑜伽', '运动'],
  医疗: ['药', '医院', '挂号', '体检', '门诊'],
};

export function mapCategory(note: string): string {
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some((kw) => note.includes(kw))) {
      return category;
    }
  }
  return '其他';
}
