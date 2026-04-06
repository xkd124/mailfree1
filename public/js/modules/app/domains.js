/**
 * 域名管理模块
 * @module modules/app/domains
 */

import { cacheGet, cacheSet, readPrefetch } from '../../storage.js';
import { isGuest } from './session.js';

// 域名列表
let domains = [];
const LOCAL_PART_RE = /^[A-Za-z0-9._-]{1,64}$/;
const WILDCARD_DOMAIN_RE = /^\*\.[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i;
const WILDCARD_SUBDOMAIN_RE = /^[A-Za-z0-9]+$/;

// 存储键
export const STORAGE_KEYS = {
  domain: 'mailfree:lastDomain',
  length: 'mailfree:lastLen'
};

/**
 * 获取域名列表
 * @returns {Array}
 */
export function getDomains() {
  return domains;
}

/**
 * 标准化域名
 * @param {string} domain - 域名
 * @returns {string}
 */
export function normalizeDomain(domain) {
  return String(domain || '').trim().toLowerCase();
}

/**
 * 是否为泛域名模板
 * @param {string} domain - 域名
 * @returns {boolean}
 */
export function isWildcardDomain(domain) {
  return WILDCARD_DOMAIN_RE.test(normalizeDomain(domain));
}

/**
 * 获取泛域名根域
 * @param {string} domain - 泛域名模板
 * @returns {string}
 */
export function getWildcardRootDomain(domain) {
  const normalized = normalizeDomain(domain);
  return isWildcardDomain(normalized) ? normalized.slice(2) : normalized;
}

/**
 * 校验邮箱用户名
 * @param {string} local - 用户名
 * @returns {boolean}
 */
export function isValidMailboxLocal(local) {
  return LOCAL_PART_RE.test(String(local || '').trim());
}

/**
 * 校验泛域名子域
 * @param {string} subdomain - 子域
 * @returns {boolean}
 */
export function isValidWildcardSubdomain(subdomain) {
  return WILDCARD_SUBDOMAIN_RE.test(String(subdomain || '').trim());
}

/**
 * 设置域名列表
 * @param {Array} list - 域名列表
 */
export function setDomains(list) {
  domains = Array.isArray(list) ? list.map(normalizeDomain).filter(Boolean) : [];
}

/**
 * 填充域名下拉框
 * @param {Array} domainList - 域名列表
 * @param {HTMLSelectElement} selectElement - 下拉框元素
 */
export function populateDomains(domainList, selectElement) {
  if (!selectElement) return;
  const list = Array.isArray(domainList) ? domainList.map(normalizeDomain).filter(Boolean) : [];
  selectElement.innerHTML = list.map((d, i) => `<option value="${i}">${d}</option>`).join('');
  
  const stored = localStorage.getItem(STORAGE_KEYS.domain) || '';
  const idx = stored ? list.indexOf(stored) : -1;
  selectElement.selectedIndex = idx >= 0 ? idx : 0;
  
  selectElement.addEventListener('change', () => {
    const opt = selectElement.options[selectElement.selectedIndex];
    if (opt) localStorage.setItem(STORAGE_KEYS.domain, opt.textContent || '');
  }, { once: true });
  
  setDomains(list);
}

/**
 * 从 API 加载域名列表
 * @param {HTMLSelectElement} selectElement - 下拉框元素
 * @param {Function} api - API 函数
 */
export async function loadDomains(selectElement, api) {
  if (isGuest()) {
    populateDomains(['example.com'], selectElement);
    return;
  }
  
  let domainSet = false;
  
  // 尝试从缓存加载
  try {
    const cached = cacheGet('domains', 24 * 60 * 60 * 1000);
    if (Array.isArray(cached) && cached.length) {
      populateDomains(cached, selectElement);
      domainSet = true;
    }
  } catch(_) {}
  
  // 尝试从预取加载
  try {
    const prefetched = readPrefetch('mf:prefetch:domains');
    if (Array.isArray(prefetched) && prefetched.length) {
      populateDomains(prefetched, selectElement);
      domainSet = true;
    }
  } catch(_) {}
  
  // 从 API 加载
  try {
    const r = await api('/api/domains');
    const domainList = await r.json();
    if (Array.isArray(domainList) && domainList.length) {
      populateDomains(domainList, selectElement);
      cacheSet('domains', domainList);
      domainSet = true;
    }
  } catch(_) {}
  
  // 降级处理
  if (!domainSet) {
    const meta = (document.querySelector('meta[name="mail-domains"]')?.getAttribute('content') || '')
      .split(',').map(s => s.trim()).filter(Boolean);
    const fallback = [];
    if (window.currentMailbox && window.currentMailbox.includes('@')) {
      fallback.push(window.currentMailbox.split('@')[1]);
    }
    if (!meta.length && location.hostname) {
      fallback.push(location.hostname);
    }
    const list = [...new Set(meta.length ? meta : fallback)].filter(Boolean);
    populateDomains(list, selectElement);
  }
}

/**
 * 获取存储的长度
 * @returns {number}
 */
export function getStoredLength() {
  const stored = Number(localStorage.getItem(STORAGE_KEYS.length) || '8');
  return Math.max(8, Math.min(30, isNaN(stored) ? 8 : stored));
}

/**
 * 保存长度
 * @param {number} length - 长度
 */
export function saveLength(length) {
  const clamped = Math.max(8, Math.min(30, isNaN(length) ? 8 : length));
  localStorage.setItem(STORAGE_KEYS.length, String(clamped));
}

/**
 * 获取选中的域名索引
 * @param {HTMLSelectElement} selectElement - 下拉框元素
 * @returns {number}
 */
export function getSelectedDomainIndex(selectElement) {
  return Number(selectElement?.value || 0);
}

/**
 * 获取当前选中的域名
 * @param {HTMLSelectElement} selectElement - 下拉框元素
 * @returns {string}
 */
export function getSelectedDomain(selectElement) {
  const index = getSelectedDomainIndex(selectElement);
  return normalizeDomain(domains[index] || domains[0] || '');
}

/**
 * 解析自定义邮箱输入
 * 普通域名：输入用户名
 * 泛域名：输入 用户名@子域 或 用户名@子域.根域
 * @param {string} inputValue - 输入内容
 * @param {string} domain - 当前选中域名
 * @returns {{ local: string, wildcardSubdomain: string }}
 */
export function parseCustomMailboxInput(inputValue, domain) {
  const value = String(inputValue || '').trim();
  const selectedDomain = normalizeDomain(domain);

  if (!isWildcardDomain(selectedDomain)) {
    if (!isValidMailboxLocal(value)) {
      throw new Error('用户名不合法，仅限字母/数字/._-');
    }
    return { local: value.toLowerCase(), wildcardSubdomain: '' };
  }

  const rootDomain = getWildcardRootDomain(selectedDomain);
  const parts = value.split('@');
  if (parts.length !== 2) {
    throw new Error(`泛域名请按 "用户名@子域" 或 "用户名@子域.${rootDomain}" 格式输入`);
  }

  const local = parts[0].trim();
  let subdomain = parts[1].trim().toLowerCase();

  if (subdomain.endsWith('.' + rootDomain)) {
    subdomain = subdomain.slice(0, -(rootDomain.length + 1));
  }

  if (!isValidMailboxLocal(local)) {
    throw new Error('用户名不合法，仅限字母/数字/._-');
  }
  if (!isValidWildcardSubdomain(subdomain)) {
    throw new Error('泛域名子域不合法，仅限字母和数字');
  }

  return {
    local: local.toLowerCase(),
    wildcardSubdomain: subdomain
  };
}

/**
 * 根据选中域名更新自定义输入提示
 * @param {HTMLSelectElement} selectElement - 域名下拉框
 * @param {HTMLInputElement} inputElement - 自定义输入框
 */
export function updateCustomInputPlaceholder(selectElement, inputElement) {
  if (!inputElement) return;
  const domain = getSelectedDomain(selectElement);
  inputElement.placeholder = isWildcardDomain(domain)
    ? `输入 用户名@子域 或 用户名@子域.${getWildcardRootDomain(domain)}`
    : '仅限字母/数字/._-';
}

/**
 * 更新范围滑块进度
 * @param {HTMLInputElement} input - 滑块元素
 */
export function updateRangeProgress(input) {
  if (!input) return;
  const min = Number(input.min || 0);
  const max = Number(input.max || 100);
  const val = Number(input.value || min);
  const percent = ((val - min) * 100) / (max - min);
  input.style.background = `linear-gradient(to right, var(--primary) ${percent}%, var(--border-light) ${percent}%)`;
}

export default {
  getDomains,
  setDomains,
  populateDomains,
  loadDomains,
  getStoredLength,
  saveLength,
  getSelectedDomainIndex,
  getSelectedDomain,
  normalizeDomain,
  isWildcardDomain,
  getWildcardRootDomain,
  isValidMailboxLocal,
  isValidWildcardSubdomain,
  parseCustomMailboxInput,
  updateCustomInputPlaceholder,
  updateRangeProgress,
  STORAGE_KEYS
};
