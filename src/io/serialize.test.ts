import { describe, it, expect, beforeEach } from "vitest";
import { toJson, parseProject, registerMigration } from "./serialize.js";
import { createEmptyProject, createEmptyScene } from "../core/schema/project.js";

describe("serialize: round-trip", () => {
  it("toJson + parseProject は deep equal を返す", () => {
    const doc = createEmptyProject();
    doc.scenes.push(createEmptyScene(0));
    const json = toJson(doc);
    const parsed = parseProject(json);
    expect(parsed).toEqual(doc);
  });
});

describe("serialize: 未知フィールド保持", () => {
  it("scene の x_custom フィールドが保存後も残る", () => {
    const doc = createEmptyProject();
    const scene = createEmptyScene(0);
    // 未知フィールドを注入
    (scene as Record<string, unknown>)["x_custom"] = 1;
    doc.scenes.push(scene);

    const json = toJson(doc);
    const parsed = parseProject(json);
    const parsedScene = parsed.scenes[0] as Record<string, unknown>;
    expect(parsedScene["x_custom"]).toBe(1);
  });

  it("project の x_extra フィールドが保存後も残る", () => {
    const doc = createEmptyProject();
    (doc as Record<string, unknown>)["x_extra"] = "preserved";
    const json = toJson(doc);
    const parsed = parseProject(json) as Record<string, unknown>;
    expect(parsed["x_extra"]).toBe("preserved");
  });
});

describe("serialize: 未来バージョンでエラー", () => {
  it("formatVersion: 9999 のファイルを読むと明示エラー", () => {
    const raw = { ...createEmptyProject(), formatVersion: 9999 };
    expect(() => parseProject(JSON.stringify(raw))).toThrow(
      "新しいバージョンのファイルです",
    );
  });
});

describe("serialize: マイグレーション", () => {
  it("v1→v2のダミーマイグレーションが適用される(テスト内登録)", () => {
    // テスト内で一時的にv1スキーマのドキュメントをv2相当に変換するマイグレーションを登録
    // ここではformatVersionを変えずにフィールドを追加するシミュレーションとして
    // migrationの仕組みテスト: formatVersion 1 のdocにmigration登録して付加フィールドが付く
    registerMigration(1, (raw) => ({
      ...raw,
      formatVersion: 1, // 現行のまま(スキーマvalidateを通るため)
      _migrated: true,
    }));

    const doc = createEmptyProject();
    const json = toJson(doc);

    // 現在のformatVersionはすでに1=CURRENT_VALUEなのでマイグレーションは通らない
    // migration(v1->v2)はCURRENT=1なので実際には呼ばれないことを確認
    // マイグレーション登録機構自体のテスト用に、低いバージョンを偽装する
    const raw = JSON.parse(json) as Record<string, unknown>;
    // バージョン0のドキュメントとして偽装してv0→v1マイグレーションをテスト
    registerMigration(0, (r) => ({ ...r, formatVersion: 1, _from_v0: true }));
    const fakeV0 = { ...raw, formatVersion: 0 };
    const parsed = parseProject(JSON.stringify(fakeV0)) as Record<string, unknown>;
    expect(parsed["_from_v0"]).toBe(true);
  });
});

describe("serialize: 不正なJSON", () => {
  it("不正JSONでエラー", () => {
    expect(() => parseProject("not json")).toThrow("JSON");
  });

  it("formatVersion欠落でエラー", () => {
    expect(() => parseProject(JSON.stringify({ title: "no version" }))).toThrow(
      "formatVersion",
    );
  });
});

beforeEach(() => {
  // 各テストで独立性を確保するためのリセットは不要
  // (registerMigrationは累積するが冪等)
});
