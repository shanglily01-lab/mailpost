import { findEmails, isEmailAddress } from "./verify";

export type ImportedContactRow = {
  email: string;
  firstName: string;
  lastName: string;
  title: string;
  company: string;
  industry: string;
  icpFit: string;
  source: string;
  consent: string;
  region: string;
  notes: string;
};

type ParsedRows = { ok: true; rows: ImportedContactRow[]; invalid: number };

export type ContactImportParse = ParsedRows | { ok: false; error: string };

const EMAIL_HEADERS = new Set([
  "email",
  "mail",
  "emailaddress",
  "emailaddr",
  "邮箱",
  "电子邮箱",
  "电子邮件",
  "邮件地址",
  "信箱",
]);

const COLUMN_FIELDS: Record<string, keyof ImportedContactRow | "name"> = {
  firstname: "firstName",
  givenname: "firstName",
  名: "firstName",
  名字: "firstName",
  lastname: "lastName",
  surname: "lastName",
  familyname: "lastName",
  姓: "lastName",
  姓氏: "lastName",
  name: "name",
  fullname: "name",
  姓名: "name",
  联系人: "name",
  company: "company",
  organization: "company",
  org: "company",
  公司: "company",
  单位: "company",
  title: "title",
  jobtitle: "title",
  position: "title",
  职位: "title",
  职务: "title",
  industry: "industry",
  行业: "industry",
  notes: "notes",
  note: "notes",
  备注: "notes",
  source: "source",
  来源: "source",
  consent: "consent",
  同意: "consent",
  region: "region",
  地区: "region",
  icp: "icpFit",
  icpfit: "icpFit",
};

function normHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[\s_-]/g, "");
}

function splitLines(text: string): string[] {
  return text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n|\r/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function countDelim(line: string, delim: string): number {
  let count = 0;
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') i += 1;
      else quoted = !quoted;
    } else if (!quoted && ch === delim) {
      count += 1;
    }
  }
  return count;
}

function detectDelimiter(line: string): "," | ";" | "\t" {
  const comma = countDelim(line, ",");
  const semi = countDelim(line, ";");
  const tab = countDelim(line, "\t");
  if (tab >= comma && tab >= semi && tab > 0) return "\t";
  if (semi > comma && semi > 0) return ";";
  return ",";
}

function splitRow(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === delimiter) {
      cells.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  cells.push(current.trim());
  return cells;
}

function emailFromCell(cell: string): string {
  const trimmed = cell.trim();
  if (isEmailAddress(trimmed)) return trimmed.toLowerCase();
  return findEmails(trimmed)[0] ?? "";
}

function emptyRow(email: string): ImportedContactRow {
  return {
    email,
    firstName: "",
    lastName: "",
    title: "",
    company: "",
    industry: "",
    icpFit: "",
    source: "",
    consent: "",
    region: "",
    notes: "",
  };
}

function parseTable(lines: string[]): ParsedRows | null {
  const delimiter = detectDelimiter(lines[0]);
  const header = splitRow(lines[0], delimiter);
  const fields = header.map((cell) => {
    const key = normHeader(cell);
    if (EMAIL_HEADERS.has(key)) return "email" as const;
    return COLUMN_FIELDS[key] ?? null;
  });
  if (!fields.includes("email")) return null;

  const rows: ImportedContactRow[] = [];
  let invalid = 0;
  for (const line of lines.slice(1)) {
    const cells = splitRow(line, delimiter);
    const row = emptyRow("");
    let name = "";
    fields.forEach((field, index) => {
      const value = cells[index] ?? "";
      if (!field || !value) return;
      if (field === "name") name = value;
      else if (field === "email") row.email = emailFromCell(value);
      else row[field] = value;
    });
    if (!row.email) {
      invalid += 1;
      continue;
    }
    if (!row.firstName && !row.lastName && name) row.firstName = name;
    rows.push(row);
  }
  return { ok: true, rows, invalid };
}

function parseLoose(text: string): ParsedRows {
  const rows = findEmails(text).map((email) => emptyRow(email));
  return { ok: true, rows, invalid: 0 };
}

export function parseContactFile(text: string): ContactImportParse {
  const normalized = text.replace(/，/g, ",").replace(/；/g, ";");
  const lines = splitLines(normalized);
  if (lines.length === 0) {
    return { ok: false, error: "文件是空的。TXT 每行一个邮箱；CSV 需要 email 或 邮箱 列。" };
  }
  const headed = parseTable(lines);
  if (headed) {
    if (headed.rows.length === 0) {
      return { ok: false, error: "没有找到邮箱。TXT 每行一个地址；CSV 需要 email 或 邮箱 列。" };
    }
    return headed;
  }
  if (findEmails(lines[0]).length === 0) {
    for (let i = 1; i < Math.min(lines.length, 8); i++) {
      const later = parseTable(lines.slice(i));
      if (later && later.rows.length > 0) return later;
    }
  }
  const loose = parseLoose(normalized);
  if (loose.rows.length === 0) {
    return { ok: false, error: "没有找到邮箱。TXT 每行一个地址；CSV 需要 email 或 邮箱 列。" };
  }
  return loose;
}
