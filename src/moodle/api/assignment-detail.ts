import { parse } from "parse5";
import { MoodleAuthError, MoodleError } from "../errors.js";
import { attr, elements, hasClass, isHidden, textContent } from "../html.js";

export interface AssignmentDetail {
  id: number;
  idType: "courseModule";
  name: string;
  url: string;
  introText?: string;
  submissionStatus?: string;
  gradingStatus?: string;
  dueDate?: string;
  timeRemaining?: string;
  lastModified?: string;
  cutoffDate?: string;
}

function normalizeDate(raw: string): string {
  if (!raw) return raw;
  const timestamp = Date.parse(raw);
  if (!Number.isNaN(timestamp)) {
    return new Date(timestamp).toISOString();
  }
  return raw;
}

export function parseAssignmentDetail(html: string, baseUrl: string, courseModuleId: number): AssignmentDetail {
  const all = elements(parse(html));
  const body = all.find(element => element.tagName === "body");
  if (body && attr(body, "id") === "page-login-index") {
    throw new MoodleAuthError("Moodle returned the login page; refresh the session credentials");
  }

  const main = all.find(element => attr(element, "id") === "region-main") ??
    all.find(element => attr(element, "role") === "main");

  if (!body || !/^page-mod-assign-view(?:-[a-z0-9_-]+)?$/.test(attr(body, "id") ?? "") || !main) {
    throw new MoodleError("Unrecognized Moodle assignment page", "MOODLE_RESPONSE_ERROR");
  }

  const content = elements(main);
  if (content.some(element => hasClass(element, "errorbox") || hasClass(element, "errorcode"))) {
    throw new MoodleError("Unexpected Moodle assignment page error", "MOODLE_RESPONSE_ERROR");
  }

  // 1. Extract assignment title / name
  const titleElement = content.find(element =>
    (element.tagName === "h2" || element.tagName === "h1") &&
    !hasClass(element, "accesshide") &&
    !isHidden(element)
  );
  let name = "";
  if (titleElement) {
    const small = elements(titleElement).find(e => e.tagName === "small" && !isHidden(e));
    if (small) {
      name = textContent(small);
    }
    if (!name) {
      name = textContent(titleElement);
    }
  }
  if (!name) {
    throw new MoodleError("Moodle assignment page has no recognizable title", "MOODLE_RESPONSE_ERROR");
  }

  const url = `${baseUrl.replace(/\/$/, "")}/mod/assign/view.php?id=${courseModuleId}`;

  const detail: AssignmentDetail = {
    id: courseModuleId,
    idType: "courseModule",
    name,
    url,
  };

  // 2. Extract intro / description instructions text
  const introElement = content.find(element =>
    (attr(element, "id") === "intro" || hasClass(element, "activity-description") || hasClass(element, "intro")) &&
    !isHidden(element)
  );
  if (introElement) {
    const text = textContent(introElement);
    if (text) detail.introText = text;
  }

  // 3. Extract submission status table
  const tables = content.filter(element =>
    element.tagName === "table" &&
    (hasClass(element, "generaltable") || hasClass(element, "submissionstatustable") || hasClass(element, "submissionsummarytable")) &&
    !isHidden(element)
  );

  for (const table of tables) {
    const rows = elements(table).filter(element => element.tagName === "tr" && !isHidden(element));
    for (const row of rows) {
      const cells = elements(row).filter(element => (element.tagName === "th" || element.tagName === "td") && !isHidden(element));
      if (cells.length < 2) continue;

      const headerCell = cells[0];
      const valueCell = cells[1];
      const label = textContent(headerCell).toLowerCase().replace(/[\s\u00A0]+/g, " ").trim();
      const value = textContent(valueCell);
      if (!value) continue;

      if (label.includes("submission status")) {
        detail.submissionStatus = value;
      } else if (label.includes("grading status")) {
        detail.gradingStatus = value;
      } else if (label.includes("due date")) {
        detail.dueDate = normalizeDate(value);
      } else if (label.includes("time remaining")) {
        detail.timeRemaining = value;
      } else if (label.includes("last modified")) {
        detail.lastModified = normalizeDate(value);
      } else if (label.includes("cut-off date") || label.includes("cutoff date")) {
        detail.cutoffDate = normalizeDate(value);
      }
    }
  }

  return detail;
}
