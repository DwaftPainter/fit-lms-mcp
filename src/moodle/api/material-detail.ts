import { parse } from "parse5";
import type { MaterialType } from "../client.js";
import { MoodleError } from "../errors.js";
import { attr, hasClass, HtmlElement, readableText, visibleElements } from "../html.js";

interface MaterialFile {
  name: string;
  url: string;
}

interface MaterialDetails {
  description?: string;
  contentText?: string;
  targetUrl?: string;
  files?: MaterialFile[];
}

function httpUrl(value: string | undefined, pageUrl: URL): URL | undefined {
  if (!value?.trim()) return;
  try {
    const url = new URL(value, pageUrl);
    if (["https:", "http:"].includes(url.protocol) && !url.username && !url.password) return url;
  } catch {
    return;
  }
}

function linkedUrl(element: HtmlElement, pageUrl: URL): URL | undefined {
  if (element.tagName === "a") return httpUrl(attr(element, "href"), pageUrl);
  if (element.tagName === "object") return httpUrl(attr(element, "data"), pageUrl);
  if (["img", "source", "iframe", "frame", "video", "audio", "embed"].includes(element.tagName)) {
    return httpUrl(attr(element, "src"), pageUrl);
  }
}

function materialFiles(links: URL[], pageUrl: URL, baseUrl: string, type: "resource" | "folder"): MaterialFile[] {
  const files = new Map<string, MaterialFile>();
  const pluginfile = new URL(`${baseUrl}/pluginfile.php`).pathname;
  const contentPath = new RegExp(`^/[1-9]\\d*/mod_${type}/content/\\d+/(?:[^/]+/)*([^/]+)$`);
  for (const url of links) {
    if (url.origin !== pageUrl.origin) continue;
    const path = url.pathname === pluginfile ? url.searchParams.get("file") :
      url.pathname.startsWith(`${pluginfile}/`) ? url.pathname.slice(pluginfile.length) : null;
    const filename = path?.match(contentPath)?.[1];
    if (!filename || !path) continue;
    const safeUrl = new URL(url.pathname, url.origin);
    if (url.pathname === pluginfile) safeUrl.searchParams.set("file", path);
    if (url.searchParams.get("forcedownload") === "1") safeUrl.searchParams.set("forcedownload", "1");
    let name = filename;
    if (url.pathname !== pluginfile) {
      try { name = decodeURIComponent(filename); } catch { continue; }
    }
    if (!files.has(path)) files.set(path, { name, url: safeUrl.toString() });
  }
  return [...files.values()];
}

function safeTargetUrl(url: URL): string {
  for (const key of [...url.searchParams.keys()]) {
    if (/^(sesskey|moodlesession|token|wstoken|access_token)$/i.test(key)) url.searchParams.delete(key);
  }
  return url.toString();
}

export function parseMaterialDetail(html: string, type: MaterialType, baseUrl: string): MaterialDetails {
  const pageUrl = new URL(`${baseUrl}/mod/${type}/view.php`);
  const document = visibleElements(parse(html));
  const body = document.find(element => element.tagName === "body");
  const main = document.find(element => attr(element, "id") === "region-main");
  if (!main || !body || attr(body, "id") !== `page-mod-${type}-view`) {
    // Moodle's legacy framed display has no body or region-main. Only read the
    // target when its navigation frame identifies this same Moodle module type.
    if ((type === "resource" || type === "url") && document.some(element => element.tagName === "frameset")) {
      const links = document.filter(element => element.tagName === "frame").flatMap(element => linkedUrl(element, pageUrl) ?? []);
      const [navigation, target] = links;
      if (links.length === 2 && navigation.origin === pageUrl.origin && navigation.pathname === pageUrl.pathname && navigation.searchParams.get("frameset") === "top") {
        return type === "url" ? { targetUrl: safeTargetUrl(target) } : { files: materialFiles([target], pageUrl, baseUrl, type) };
      }
    }
    throw new MoodleError("Unrecognized Moodle material page", "MOODLE_RESPONSE_ERROR");
  }

  const markup = visibleElements(main);
  const intro = markup.find(element => attr(element, "id") === "intro" || hasClass(element, "activity-description"));
  const description = intro ? readableText(intro) : "";
  const details: MaterialDetails = description ? { description } : {};
  if (type === "page") {
    const content = markup.find(element => hasClass(element, "generalbox") && hasClass(element, "center"));
    if (content) details.contentText = readableText(content);
    return details;
  }

  let display = markup.find(element => type === "folder" ? /^folder_tree\d+$/.test(attr(element, "id") ?? "") : hasClass(element, `${type}workaround`));
  if (!display && type !== "folder") {
    const introMarkup = new Set(intro ? visibleElements(intro) : []);
    display = markup.find(element => !introMarkup.has(element) && (hasClass(element, "resourcecontent") ||
      hasClass(element, "mediaplugin") || attr(element, "id") === "resourceobject"));
  }
  const links = display ? visibleElements(display).flatMap(element => linkedUrl(element, pageUrl) ?? []) : [];
  if (type === "url") {
    if (links[0]) details.targetUrl = safeTargetUrl(links[0]);
  } else {
    details.files = materialFiles(links, pageUrl, baseUrl, type);
  }
  return details;
}
