import { type DefaultTreeAdapterTypes } from "parse5";

export type HtmlNode = DefaultTreeAdapterTypes.Node;
export type HtmlElement = DefaultTreeAdapterTypes.Element;
export const attr = (element: HtmlElement, name: string) => element.attrs.find(attribute => attribute.name === name)?.value;
export const hasClass = (element: HtmlElement, name: string) => attr(element, "class")?.split(/\s+/).includes(name) ?? false;

export function* nodes(root: HtmlNode, skipAccessHide = false): Generator<HtmlNode> {
  const stack = [root];
  while (stack.length) {
    const node = stack.pop()!;
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

export function isHidden(element: HtmlElement): boolean {
  return attr(element, "hidden") !== undefined || attr(element, "aria-hidden") === "true" ||
    ["hidden", "hiddenfromstudents", "dimmed", "d-none"].some(name => hasClass(element, name)) ||
    /(?:display\s*:\s*none|visibility\s*:\s*hidden)/i.test(attr(element, "style") ?? "");
}
