import { parse } from "parse5";
import { moduleViewUrl } from "../assignment-url.js";
import { MoodleAuthError, MoodleError } from "../errors.js";
import { attr, elements, hasClass, HtmlElement, isHidden, textContent } from "../html.js";

export interface CourseModuleSummary {
  id: number;
  name: string;
  type: string;
  url: string | null;
  visible: true;
}
export interface CourseSectionSummary {
  id: number | null;
  number: number;
  name: string;
  visible: true;
  modules: CourseModuleSummary[];
}

const positiveId = (value: string | undefined) => value && /^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value)) ? Number(value) : null;

function moduleSummary(module: HtmlElement, section: HtmlElement, baseUrl: string): CourseModuleSummary | null {
  for (let ancestor: HtmlElement | null = module; ancestor && ancestor !== section; ancestor = ancestor.parentNode && "tagName" in ancestor.parentNode ? ancestor.parentNode : null) {
    if (isHidden(ancestor)) return null;
  }
  const content = elements(module);
  if (content.some(element => hasClass(element, "hiddenfromstudents"))) return null;
  const type = attr(module, "class")?.split(/\s+/).map(name => name.match(/^modtype_([a-z][a-z0-9_]*)$/)?.[1]).find(Boolean);
  if (!type) return null;
  const id = positiveId(attr(module, "data-id") ?? attr(module, "id")?.replace(/^module-/, ""));
  if (!id) throw new MoodleError("Invalid Moodle course module ID", "MOODLE_RESPONSE_ERROR");
  for (const anchor of content.filter(element => element.tagName === "a")) {
    const url = moduleViewUrl(attr(anchor, "href"), baseUrl, type);
    if (!url || Number(new URL(url).searchParams.get("id")) !== id) continue;
    const title = elements(anchor).find(element => hasClass(element, "instancename")) ?? anchor;
    const name = textContent(title);
    if (name) return { id, name, type, url, visible: true };
  }
  // Labels are inline content and normally have no view URL. Other linkless
  // activities may be restricted, so do not expose their names or metadata.
  if (type === "label" && !content.some(element => hasClass(element, "availabilityinfo"))) {
    const title = content.find(element => hasClass(element, "contentwithoutlink"));
    const name = title ? textContent(title) : "";
    if (name) return { id, name, type, url: null, visible: true };
  }
  return null;
}

export function parseCourseContents(html: string, baseUrl: string): CourseSectionSummary[] {
  const all = elements(parse(html));
  const body = all.find(element => element.tagName === "body");
  if (body && attr(body, "id") === "page-login-index") throw new MoodleAuthError("Sign in to the LMS, refresh the local session credentials and restart the MCP server");
  const main = all.find(element => attr(element, "id") === "region-main");
  const course = main && elements(main).find(element => hasClass(element, "course-content"));
  if (!body || !/^page-course-view(?:-[a-z0-9_-]+)?$/.test(attr(body, "id") ?? "") || !course) {
    throw new MoodleError("Unrecognized Moodle course page", "MOODLE_RESPONSE_ERROR");
  }
  const sections: CourseSectionSummary[] = [];
  for (const section of elements(course).filter(element => element.tagName === "li" && (attr(element, "data-for") === "section" || hasClass(element, "course-section")))) {
    if (isHidden(section)) continue;
    const content = elements(section);
    if (content.some(element => hasClass(element, "section_availability") && textContent(element))) continue;
    const numberValue = attr(section, "data-number") ?? attr(section, "id")?.replace(/^section-/, "");
    if (!numberValue || !/^\d+$/.test(numberValue)) throw new MoodleError("Invalid Moodle course section", "MOODLE_RESPONSE_ERROR");
    const number = Number(numberValue);
    const heading = content.find(element => attr(element, "data-for") === "section_title" || hasClass(element, "sectionname"));
    const title = heading && (elements(heading).find(element => /^h[1-6]$/.test(element.tagName)) ?? heading);
    const modules = new Map<number, CourseModuleSummary>();
    for (const module of content.filter(element => element.tagName === "li" && hasClass(element, "activity"))) {
      const summary = moduleSummary(module, section, baseUrl);
      if (summary) modules.set(summary.id, summary);
    }
    sections.push({
      id: positiveId(attr(section, "data-id")), number,
      name: (title && textContent(title)) || `Section ${number}`, visible: true,
      modules: [...modules.values()],
    });
  }
  return sections;
}
