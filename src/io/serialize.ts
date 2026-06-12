import { ProjectDocSchema } from "../core/schema/project.js";
import type { ProjectDoc } from "../core/schema/project.js";

type MigrationFn = (raw: Record<string, unknown>) => Record<string, unknown>;

const migrations: Map<number, MigrationFn> = new Map();

export function registerMigration(fromVersion: number, fn: MigrationFn): void {
  migrations.set(fromVersion, fn);
}

const CURRENT_VERSION = 1;

export function toJson(doc: ProjectDoc): string {
  return JSON.stringify(doc, null, 2);
}

export function parseProject(json: string): ProjectDoc {
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(json) as Record<string, unknown>;
  } catch {
    throw new Error("JSONの解析に失敗しました");
  }

  const version = raw["formatVersion"];
  if (typeof version !== "number") {
    throw new Error("formatVersion が見つかりません");
  }

  if (version > CURRENT_VERSION) {
    throw new Error(
      `新しいバージョンのファイルです (v${version})。アプリを更新してください。`,
    );
  }

  let migrated = raw;
  for (let v = version; v < CURRENT_VERSION; v++) {
    const fn = migrations.get(v);
    if (fn) {
      migrated = fn(migrated);
    }
  }

  const result = ProjectDocSchema.safeParse(migrated);
  if (!result.success) {
    throw new Error(`スキーマ検証エラー: ${result.error.message}`);
  }
  return result.data as ProjectDoc;
}
