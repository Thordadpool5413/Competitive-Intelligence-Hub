import * as cheerio from 'cheerio';
import type { CrawledPage } from './types';

const strongPaths = ['service','services','program','programs','hospice','home-health','home-care','palliative','wound','dementia','guide','behavioral','therapy','pediatric','maternal','child','referral','locations','service-area','bereavement','audiology','caregiver'];
const weakPaths = ['career','job','donat','event','privacy','terms','login','wp-admin'];

function getAllowedHostPatterns(): string[] {
  return (process.env.CRAWL_ALLOWED_HOSTS || '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

function matchesAllowedHost(hostname: string, patterns: string[]): boolean {
  const host = hostname.toLowerCase();
  return patterns.some((pattern) => {
    if (pattern.startsWith('*.')) {
      const suffix = pattern.slice(2);
      return host === suffix || host.endsWith(`.${suffix}`);
    }
    return host === pattern;
  });
}

function requireAllowedHost(url: string) {
  const patterns = getAllowedHostPatterns();
  if (!patterns.length) return;
  const host = new URL(url).hostname.toLowerCase();
  if (!matchesAllowedHost(host, patterns)) {
    throw new Error('Target host is not allowed for crawling.');
  }
}

function clean(text: string) {
  return text.replace(/\s+/g, ' ').replace(/\u00a0/g, ' ').trim();
}

function normalize(url: string, base?: string): string | null {
  try {
    const parsed = new URL(url, base);
    parsed.hash = '';
    parsed.username = '';
    parsed.password = '';
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    return parsed.toString().replace(/\/$/, '/');
  } catch {
    return null;
  }
}

function cleanHost(hostname: string) {
  return hostname.toLowerCase().trim().replace(/^\[/, '').replace(/\]$/, '').replace(/\.$/, '');
}

function blockedIPv4(host: string) {
  const parts = cleanHost(host).split('.').map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b] = parts;
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

function blockedIPv6(host: string) {
  const value = cleanHost(host);
  if (!value.includes(':')) return false;
  if (value.includes('%')) return true;
  if (value === '::' || value === '::1' || value === '0:0:0:0:0:0:0:1') return true;
  if (/^fe[89ab]/i.test(value)) return true;
  if (/^f[cd]/i.test(value)) return true;
  const mapped = value.match(/(?:^|:)ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i)?.[1];
  return mapped ? blockedIPv4(mapped) : false;
}

export function isSafePublicTarget(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) return false;
    const host = cleanHost(parsed.hostname);
    if (!host || host === 'localhost') return false;
    if (host.endsWith('.local') || host.endsWith('.localhost') || host.endsWith('.internal') || host.endsWith('.lan')) return false;
    if (blockedIPv4(host) || blockedIPv6(host)) return false;
    return true;
  } catch {
    return false;
  }
}

function requireSafePublicTarget(url: string) {
  if (!isSafePublicTarget(url)) {
    throw new Error('Unsafe crawl target blocked. Enter a public http or https competitor website.');
  }
}

function sameHost(a: string, b: string) {
  try {
    return new URL(a).hostname.replace(/^www\./, '') === new URL(b).hostname.replace(/^www\./, '');
  } catch {
    return false;
  }
}

function scoreUrl(url: string) {
  const lower = url.toLowerCase();
  let score = 0;
  strongPaths.forEach((path) => { if (lower.includes(path)) score += 5; });
  weakPaths.forEach((path) => { if (lower.includes(path)) score -= 10; });
  return score;
}

async function fetchHtml(url: string, redirectCount = 0): Promise<string> {
  const safeUrl = normalize(url);
  if (!safeUrl) throw new Error('Invalid URL. Use a complete public website address.');
  requireSafePublicTarget(safeUrl);
  requireAllowedHost(safeUrl);
  if (redirectCount > 5) throw new Error('Too many redirects while crawling website.');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Number(process.env.CRAWL_TIMEOUT_MS || 12000));
  try {
    const res = await fetch(safeUrl, {
      redirect: 'manual',
      signal: controller.signal,
      headers: {
        'user-agent': 'CompetitiveIntelligenceHub/1.0 public healthcare service research',
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    });

    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const location = res.headers.get('location');
      const next = location ? normalize(location, safeUrl) : null;
      if (!next) throw new Error('Redirect destination was not readable.');
      requireSafePublicTarget(next);
      requireAllowedHost(next);
      return fetchHtml(next, redirectCount + 1);
    }

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const type = res.headers.get('content-type') || '';
    if (!type.includes('text/html') && !type.includes('application/xhtml+xml')) return '';
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

function pageFromHtml(url: string, html: string): CrawledPage {
  const $ = cheerio.load(html);
  $('script,style,nav,footer,header,noscript,svg,form').remove();
  const title = clean($('title').first().text() || $('h1').first().text() || url);
  const headings = $('h1,h2,h3').map((_, el) => clean($(el).text())).get().filter(Boolean).join(' | ');
  const body = clean(`${headings} ${$('body').text()}`);
  return { url, title, text: body.slice(0, 32000), excerpt: body.slice(0, 900) };
}

function linksFromHtml(root: string, html: string) {
  const $ = cheerio.load(html);
  const links = new Set<string>();
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    if (!href) return;
    const full = normalize(href, root);
    if (!full || !sameHost(full, root)) return;
    if (full.includes('mailto:') || full.includes('tel:')) return;
    if (!isSafePublicTarget(full)) return;
    links.add(full);
  });
  return [...links].sort((a, b) => scoreUrl(b) - scoreUrl(a));
}

export async function crawlSite(startUrl: string, maxPages = 24): Promise<CrawledPage[]> {
  const root = normalize(startUrl);
  if (!root) throw new Error('Invalid URL. Use a complete public website address.');
  requireSafePublicTarget(root);
  requireAllowedHost(root);

  const html = await fetchHtml(root);
  if (!html) throw new Error('The website did not return readable public HTML.');
  const pages: CrawledPage[] = [pageFromHtml(root, html)];
  const seen = new Set<string>([root]);
  const links = linksFromHtml(root, html).filter((url) => scoreUrl(url) >= -2).slice(0, maxPages * 2);
  for (const url of links) {
    if (pages.length >= maxPages) break;
    if (seen.has(url)) continue;
    seen.add(url);
    try {
      const nextHtml = await fetchHtml(url);
      if (!nextHtml) continue;
      const page = pageFromHtml(url, nextHtml);
      if (page.text.length > 160) pages.push(page);
    } catch {}
  }
  return pages;
}
