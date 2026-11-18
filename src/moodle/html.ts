import { type DefaultTreeAdapterTypes } from "parse5";

export type HtmlNode = DefaultTreeAdapterTypes.Node;
export type HtmlElement = DefaultTreeAdapterTypes.Element;
export const attr = (element: HtmlElement, name: string) => element.attrs.find(attribute => attribute.name === name)?.value;
export const hasClass = (element: HtmlElement, name: string) => attr(element, "class")?.split(/\s+/).includes(name) ?? false;

export function* nodes(root: HtmlNode, skipAccessHide = false, visibleOnly = false): Generator<HtmlNode> {
  const stack = [root];
  while (stack.length) {
    const node = stack.pop()!;
    if (visibleOnly && "tagName" in node && (isHidden(node) || hasClass(node, "dimmed_text"))) continue;
    yield node;
    if ("tagName" in node && (["script", "style", "template"].includes(node.tagName) || (skipAccessHide && hasClass(node, "accesshide")))) continue;
    if ("childNodes" in node) {
      for (let i = node.childNodes.length - 1; i >= 0; i--) stack.push(node.childNodes[i]);
    }
  }
}

export const elements = (root: HtmlNode) => [...nodes(root)].filter((node): node is HtmlElement => "tagName" in node);
export const textContent = (root: HtmlNode) => [...nodes(root, true)]
  .filter((node): node is DefaultTreeAdapterTypes.TextNode => node.nodeName === "#text")
  .map(node => node.value).join("").replace(/\s+/g, " ").trim();

export const visibleElements = (root: HtmlNode) => [...nodes(root, false, true)].filter((node): node is HtmlElement => "tagName" in node);

export function readableText(root: HtmlNode): string {
  const parts = [];
  for (const node of nodes(root, true, true)) {
    if (node.nodeName === "#text" && "value" in node) parts.push(node.value);
    if ("tagName" in node && /^(br|div|h[1-6]|li|p|td|tr)$/.test(node.tagName)) parts.push(" ");
  }
  return parts.join("").replace(/\s+/g, " ").trim();
}

export function isHidden(element: HtmlElement): boolean {
  return attr(element, "hidden") !== undefined || attr(element, "aria-hidden") === "true" ||
    ["hidden", "hiddenfromstudents", "dimmed", "d-none"].some(name => hasClass(element, name)) ||
    /(?:display\s*:\s*none|visibility\s*:\s*hidden)/i.test(attr(element, "style") ?? "");
}
