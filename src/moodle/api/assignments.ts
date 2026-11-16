import { parse, type DefaultTreeAdapterTypes } from "parse5";
import { assignmentUrl } from "../assignment-url.js";
import { MoodleAuthError, MoodleError } from "../errors.js";
import { nodes, attr, hasClass, isHidden } from "../html.js";

type Element = DefaultTreeAdapterTypes.Element;

export interface AssignmentLink {
  courseModuleId: number;
  title: string;
  url: string;
}

/** Parse links only; localized dates and submission labels are deliberately not inferred. */
export function parseAssignmentIndex(html: string, baseUrl: string): AssignmentLink[] {
  const elements = [...nodes(parse(html))].filter((node): node is Element => "tagName" in node);
  const body = elements.find(element => element.tagName === "body");
  if (body && attr(body, "id") === "page-login-index") {
    throw new MoodleAuthError("Moodle returned the login page; refresh the session credentials");
  }
  const main = elements.find(element => attr(element, "id") === "region-main");
  if (!body || attr(body, "id") !== "page-mod-assign-index" || !main) {
    throw new MoodleError("Unrecognized Moodle assignment index", "MOODLE_RESPONSE_ERROR");
  }
  const content = [...nodes(main)].filter((node): node is Element => "tagName" in node);
  const tables = content.filter(element => element.tagName === "table" && hasClass(element, "generaltable"));
  if (content.some(element => hasClass(element, "errorbox") || hasClass(element, "errorcode")) ||
      (!tables.length && !(content.some(element => hasClass(element, "alert")) && content.some(element => hasClass(element, "continuebutton"))))) {
    throw new MoodleError("Unexpected Moodle assignment index content", "MOODLE_RESPONSE_ERROR");
  }
  const assignments = new Map<number, AssignmentLink>();
  for (const table of tables) {
    for (const node of nodes(table)) {
      if (!("tagName" in node) || node.tagName !== "a") continue;
      let hidden = false;
      for (let ancestor: Element | null = node; ancestor; ancestor = ancestor.parentNode && "tagName" in ancestor.parentNode ? ancestor.parentNode : null) {
        if (isHidden(ancestor)) { hidden = true; break; }
        if (ancestor === table) break;
      }
      if (hidden) continue;
      const url = assignmentUrl(attr(node, "href"), baseUrl);
      if (!url) continue;
      const courseModuleId = Number(new URL(url).searchParams.get("id"));
      const title = [...nodes(node)].filter((child): child is DefaultTreeAdapterTypes.TextNode => child.nodeName === "#text")
        .map(child => child.value).join("").replace(/\s+/g, " ").trim();
      if (!title) throw new MoodleError("Moodle assignment link has no title", "MOODLE_RESPONSE_ERROR");
      if (!assignments.has(courseModuleId)) assignments.set(courseModuleId, { courseModuleId, title, url });
    }
  }
  return [...assignments.values()];
}
