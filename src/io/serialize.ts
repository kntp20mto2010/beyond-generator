import type { ZodTypeAny } from "zod";
import { ProjectDocSchema } from "../core/schema/project.js";
import type { ProjectDoc } from "../core/schema/project.js";
import { CharacterDocSchema } from "../core/schema/character.js";
import type { CharacterDoc } from "../core/schema/character.js";

type MigrationFn = (raw: Record<string, unknown>) => Record<string, unknown>;

export interface JsonDocIO<T> {
  toJson(doc: T): string;
  parse(json: string): T;
  registerMigration(fromVersion: number, fn: MigrationFn): void;
}

export function createJsonDocIO<T>(opts: {
  schema: ZodTypeAny;
  currentVersion: number;
  migrations?: Map<number, MigrationFn>;
}): JsonDocIO<T> {
  const migrations: Map<number, MigrationFn> = opts.migrations ?? new Map();
  const { schema, currentVersion } = opts;

  return {
    toJson(doc: T): string {
      return JSON.stringify(doc, null, 2);
    },

    parse(json: string): T {
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

      if (version > currentVersion) {
        throw new Error(
          `新しいバージョンのファイルです (v${version})。アプリを更新してください。`,
        );
      }

      let migrated = raw;
      for (let v = version; v < currentVersion; v++) {
        const fn = migrations.get(v);
        if (fn) {
          migrated = fn(migrated);
        }
      }

      const result = schema.safeParse(migrated);
      if (!result.success) {
        throw new Error(`スキーマ検証エラー: ${result.error.message}`);
      }
      return result.data as T;
    },

    registerMigration(fromVersion: number, fn: MigrationFn): void {
      migrations.set(fromVersion, fn);
    },
  };
}

// ---------------------------------------------------------------------------
// Project IO (既存 API を温存)
// ---------------------------------------------------------------------------

const _projectMigrations: Map<number, MigrationFn> = new Map();
const _projectIO = createJsonDocIO<ProjectDoc>({
  schema: ProjectDocSchema,
  currentVersion: 1,
  migrations: _projectMigrations,
});

export function toJson(doc: ProjectDoc): string {
  return _projectIO.toJson(doc);
}

export function parseProject(json: string): ProjectDoc {
  return _projectIO.parse(json);
}

export function registerMigration(fromVersion: number, fn: MigrationFn): void {
  _projectIO.registerMigration(fromVersion, fn);
}

// ---------------------------------------------------------------------------
// Character IO
// ---------------------------------------------------------------------------

export const characterDocIO: JsonDocIO<CharacterDoc> = createJsonDocIO<CharacterDoc>({
  schema: CharacterDocSchema,
  currentVersion: 1,
});
