export const SEVERITIES = ["critical", "high", "medium", "low"] as const;
export type Severity = (typeof SEVERITIES)[number];

export type Finding = {
  file: string;
  line: number;
  severity: Severity;
  cwe: string;
  issue: string;
  fix: string;
};

export type DependencyVuln = {
  name: string;
  version: string;
  ids: string[];
};

export type ReviewResult = {
  repo: string;
  files: string[];
  findings: Finding[];
  dependencies: DependencyVuln[];
};
