/**
 * 通用工具函数模块
 * @module utils/common
 */

/**
 * 从邮件地址中提取纯邮箱地址
 * 处理各种格式如 "Name <email@domain.com>" 或 "<email@domain.com>"
 * @param {string} addr - 原始邮件地址字符串
 * @returns {string} 纯邮箱地址
 */
export function extractEmail(addr) {
  const s = String(addr || '').trim();
  const m = s.match(/<([^>]+)>/);
  if (m) return m[1].trim();
  return s.split(/\s/)[0] || s;
}

const WILDCARD_DOMAIN_RE = /^\*\.[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i;
const WILDCARD_SUBDOMAIN_RE = /^[a-z0-9]+$/i;

/**
 * 生成指定长度的随机ID
 * @param {number} length - ID长度，默认为8
 * @returns {string} 随机生成的ID字符串
 */
export function generateRandomId(length = 8) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * 验证邮箱地址格式
 * @param {string} email - 邮箱地址
 * @returns {boolean} 是否为有效的邮箱格式
 */
export function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.trim());
}

/**
 * 标准化域名
 * @param {string} domain - 域名
 * @returns {string}
 */
export function normalizeDomainName(domain) {
  return String(domain || '').trim().toLowerCase();
}

/**
 * 是否为泛域名模板
 * @param {string} domain - 域名
 * @returns {boolean}
 */
export function isWildcardDomainPattern(domain) {
  return WILDCARD_DOMAIN_RE.test(normalizeDomainName(domain));
}

/**
 * 是否为合法泛域名子域
 * @param {string} subdomain - 子域
 * @returns {boolean}
 */
export function isValidWildcardSubdomain(subdomain) {
  return WILDCARD_SUBDOMAIN_RE.test(String(subdomain || '').trim());
}

/**
 * 将域名模板解析为真实域名
 * @param {string} domain - 域名或泛域名模板
 * @param {string} wildcardSubdomain - 泛域名子域
 * @returns {string}
 */
export function resolveMailboxDomain(domain, wildcardSubdomain = '') {
  const normalizedDomain = normalizeDomainName(domain);
  if (!normalizedDomain) throw new Error('域名不能为空');
  if (!isWildcardDomainPattern(normalizedDomain)) return normalizedDomain;

  const subdomain = String(wildcardSubdomain || '').trim().toLowerCase();
  if (!subdomain) throw new Error('泛域名缺少子域');
  if (!isValidWildcardSubdomain(subdomain)) {
    throw new Error('泛域名子域仅支持字母和数字');
  }

  return `${subdomain}.${normalizedDomain.slice(2)}`;
}

/**
 * 计算文本的SHA-256哈希值并返回十六进制字符串
 * @param {string} text - 需要计算哈希的文本内容
 * @returns {Promise<string>} 十六进制格式的SHA-256哈希值
 */
export async function sha256Hex(text) {
  const enc = new TextEncoder();
  const data = enc.encode(String(text || ''));
  const digest = await crypto.subtle.digest('SHA-256', data);
  const bytes = new Uint8Array(digest);
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, '0');
  }
  return out;
}

/**
 * 验证原始密码与哈希密码是否匹配
 * @param {string} rawPassword - 原始明文密码
 * @param {string} hashed - 已哈希的密码
 * @returns {Promise<boolean>} 验证结果，true表示密码匹配
 */
export async function verifyPassword(rawPassword, hashed) {
  if (!hashed) return false;
  try {
    const hex = (await sha256Hex(rawPassword)).toLowerCase();
    return hex === String(hashed || '').toLowerCase();
  } catch (_) {
    return false;
  }
}
