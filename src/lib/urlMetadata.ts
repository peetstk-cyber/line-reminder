export interface UrlMetadata {
  url: string;
  domain: string;
  title: string;
  description?: string;
  faviconUrl: string;
}

const URL_REGEX = /(https?:\/\/[^\s]+)/i;

export function extractUrlFromText(text: string): string | null {
  if (!text) return null;
  const match = text.match(URL_REGEX);
  if (!match) return null;
  let url = match[0].trim();
  // Clean up trailing punctuation if any
  url = url.replace(/[),.;!]+$/, "");
  return url;
}

export function extractDomain(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "");
  } catch (e) {
    return "website.com";
  }
}

export function getFaviconUrl(domain: string): string {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`;
}

export async function fetchUrlMetadata(rawUrl: string): Promise<UrlMetadata> {
  const domain = extractDomain(rawUrl);
  const faviconUrl = getFaviconUrl(domain);

  // Default fallback metadata
  const fallback: UrlMetadata = {
    url: rawUrl,
    domain,
    title: formatDomainTitle(domain),
    faviconUrl,
  };

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);

    const response = await fetch(rawUrl, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return fallback;
    }

    const html = await response.text();

    // Extract OpenGraph Title or HTML Title
    const ogTitleMatch = html.match(/<meta\s+property=["']og:title["']\s+content=["'](.*?)["']/i) ||
                         html.match(/<meta\s+content=["'](.*?)["']\s+property=["']og:title["']/i);
    const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i);

    let title = "";
    if (ogTitleMatch && ogTitleMatch[1]) {
      title = decodeHtmlEntities(ogTitleMatch[1].trim());
    } else if (titleMatch && titleMatch[1]) {
      title = decodeHtmlEntities(titleMatch[1].trim());
    }

    // Extract OpenGraph Description
    const ogDescMatch = html.match(/<meta\s+property=["']og:description["']\s+content=["'](.*?)["']/i) ||
                        html.match(/<meta\s+name=["']description["']\s+content=["'](.*?)["']/i);
    const description = ogDescMatch && ogDescMatch[1] ? decodeHtmlEntities(ogDescMatch[1].trim()) : undefined;

    if (!title) {
      title = formatDomainTitle(domain);
    }

    return {
      url: rawUrl,
      domain,
      title,
      description,
      faviconUrl,
    };
  } catch (err) {
    // If fetching fails or times out, return friendly domain title fallback
    return fallback;
  }
}

function formatDomainTitle(domain: string): string {
  if (!domain) return "ลิงก์เว็บ";
  const name = domain.split(".")[0];
  if (!name) return domain;
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#39;/g, "'");
}
