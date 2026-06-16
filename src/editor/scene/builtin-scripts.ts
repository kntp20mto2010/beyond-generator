// 内蔵台本(テンプレート)の登録表。台本ピッカーから dev サーバー配信の JSON を
// fetch → parseProject → store.reset で読み込む(ファイルは上書きしない・メモリ上のみ)。
export interface BuiltinScript {
  id: string;
  title: string;
  subtitle: string;
  path: string; // dev サーバー配信パス
}

export const BUILTIN_SCRIPTS: BuiltinScript[] = [
  {
    id: "newchar-day1",
    title: "ふたりの登校時間 第1話",
    subtitle: "新キャラ(サクラ/リョウタ)・4シーン",
    path: "/examples/newchar-day1.byp.json",
  },
  {
    id: "school-day1",
    title: "学校の日常 第1話",
    subtitle: "内蔵キャラ(ハル/ハナ)・4シーン",
    path: "/project.byp.json",
  },
];
