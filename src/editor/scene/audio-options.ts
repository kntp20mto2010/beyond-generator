import type { FileSystemAdapter } from "../../io/fs.js";

// リポジトリ同梱音声(devサーバー配信)。glob が効かない環境向けの内蔵フォールバック。
const BUILTIN_AUDIO: readonly string[] = [
  "assets/audio/vo-001.wav",
  "assets/audio/vo-002.wav",
  "assets/audio/vo-003.wav",
  "assets/audio/vo-004.wav",
  "assets/audio/vo-005.wav",
  "assets/audio/vo-006.wav",
  "assets/audio/vo-007.wav",
];

// import.meta.glob のキー("/assets/audio/xxx.wav")を "assets/audio/xxx.wav" へ正規化
function globKeys(): string[] {
  try {
    const mods = import.meta.glob("/assets/audio/*.{wav,mp3}", { query: "?url", eager: false });
    return Object.keys(mods).map((k) => k.replace(/^\//, ""));
  } catch {
    return [];
  }
}

// 音声選択肢: glob(無ければ内蔵)+ プロジェクトフォルダの assets/audio。重複は除く。
export async function listAudioOptions(fs: FileSystemAdapter | null): Promise<string[]> {
  const set = new Set<string>();
  const fromGlob = globKeys();
  for (const k of fromGlob.length > 0 ? fromGlob : BUILTIN_AUDIO) set.add(k);
  if (fs) {
    const names = await fs.listFiles("assets/audio");
    for (const n of names) {
      if (/\.(wav|mp3)$/i.test(n)) set.add(`assets/audio/${n}`);
    }
  }
  return [...set].sort();
}

// パスからラベル(拡張子なしのファイル名)。台本/UI用。
export function audioLabel(path: string): string {
  return path.replace(/^.*\//, "").replace(/\.(wav|mp3)$/i, "");
}
