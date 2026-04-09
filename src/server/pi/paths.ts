import "server-only";

import { mkdir } from "node:fs/promises";
import { join, relative } from "node:path";

const REPO_ROOT = process.cwd();
const DATA_ROOT = join(REPO_ROOT, ".data");
const SESSIONS_ROOT = join(DATA_ROOT, "sessions");

export interface SessionPaths {
  sessionRoot: string;
  workspaceDir: string;
  recordsDir: string;
}

export function getDataRoot() {
  return DATA_ROOT;
}

export function toRepoRelativePath(target: string) {
  const relativePath = relative(REPO_ROOT, target);
  return relativePath === "" ? "." : relativePath;
}

export async function ensureDataDirectories() {
  await mkdir(SESSIONS_ROOT, { recursive: true });
}

export async function ensureSessionPaths(sessionId: string): Promise<SessionPaths> {
  const sessionRoot = join(SESSIONS_ROOT, sessionId);
  const workspaceDir = join(sessionRoot, "workspace");
  const recordsDir = join(sessionRoot, "records");

  await Promise.all([
    mkdir(sessionRoot, { recursive: true }),
    mkdir(workspaceDir, { recursive: true }),
    mkdir(recordsDir, { recursive: true }),
  ]);

  return {
    sessionRoot,
    workspaceDir,
    recordsDir,
  };
}
