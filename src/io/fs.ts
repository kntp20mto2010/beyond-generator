import "./fs-access.d.js";

export interface FileSystemAdapter {
  pickProjectFolder(): Promise<boolean>;
  readTextFile(relPath: string): Promise<string | null>;
  writeTextFile(relPath: string, content: string): Promise<void>;
  readonly folderName: string | null;
}

export class FsAccessAdapter implements FileSystemAdapter {
  #handle: FileSystemDirectoryHandle | null = null;

  get folderName(): string | null {
    return this.#handle?.name ?? null;
  }

  async pickProjectFolder(): Promise<boolean> {
    try {
      this.#handle = await showDirectoryPicker({ mode: "readwrite" });
      return true;
    } catch {
      return false;
    }
  }

  async readTextFile(relPath: string): Promise<string | null> {
    if (!this.#handle) return null;
    try {
      const parts = relPath.split("/");
      let dir: FileSystemDirectoryHandle = this.#handle;
      for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        if (!part) continue;
        dir = await dir.getDirectoryHandle(part);
      }
      const fileName = parts[parts.length - 1];
      if (!fileName) return null;
      const fileHandle = await dir.getFileHandle(fileName);
      const file = await fileHandle.getFile();
      return file.text();
    } catch {
      return null;
    }
  }

  async writeTextFile(relPath: string, content: string): Promise<void> {
    if (!this.#handle) throw new Error("フォルダが選択されていません");
    const parts = relPath.split("/");
    let dir: FileSystemDirectoryHandle = this.#handle;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!part) continue;
      dir = await dir.getDirectoryHandle(part, { create: true });
    }
    const fileName = parts[parts.length - 1];
    if (!fileName) throw new Error("ファイル名が空です");
    const fileHandle = await dir.getFileHandle(fileName, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(content);
    await writable.close();
  }
}

export class MemoryAdapter implements FileSystemAdapter {
  #files = new Map<string, string>();
  #folderName: string | null = null;

  get folderName(): string | null {
    return this.#folderName;
  }

  async pickProjectFolder(): Promise<boolean> {
    this.#folderName = "memory";
    return true;
  }

  async readTextFile(relPath: string): Promise<string | null> {
    return this.#files.get(relPath) ?? null;
  }

  async writeTextFile(relPath: string, content: string): Promise<void> {
    this.#files.set(relPath, content);
  }
}

export const PROJECT_FILE = "project.byp.json";
