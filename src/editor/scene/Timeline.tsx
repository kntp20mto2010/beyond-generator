import { useRef } from "react";
import type { DocStore } from "../../core/doc-store.js";
import type { ProjectDoc, SceneDoc } from "../../core/schema/project.js";
import type { AssetResolver } from "../../io/asset-resolver.js";
import type { ThumbnailService } from "../thumbs/thumbnail-service.js";
import { setSceneDuration } from "../../core/commands-project.js";
import { CameraLane, ElementLane, NAME_W } from "./timeline-lane.js";

interface Props {
  store: DocStore<ProjectDoc>;
  scene: SceneDoc;
  t: number;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onScrub: (t: number) => void; // live(tRef + ラベル)
  onScrubCommit: () => void; // pointerup(物理reseek)
  resolver: AssetResolver;
  thumbs: ThumbnailService | null;
}

export function Timeline({
  store,
  scene,
  t,
  selectedId,
  onSelect,
  onScrub,
  onScrubCommit,
  resolver,
  thumbs,
}: Props) {
  const trackRef = useRef<HTMLDivElement>(null); // ルーラー兼幅計測の基準
  const dur = scene.duration;

  // トラック幅(px) / 秒 — スナップ閾値とドラッグ換算に使う
  const pxPerSec = (): number => {
    const w = trackRef.current?.getBoundingClientRect().width ?? 0;
    return w > 0 && dur > 0 ? w / dur : 0;
  };

  const xToTime = (clientX: number): number => {
    const track = trackRef.current;
    if (!track) return 0;
    const rect = track.getBoundingClientRect();
    const ratio = (clientX - rect.left) / rect.width;
    return Math.max(0, Math.min(dur, ratio * dur));
  };

  // 共通スクラブ(ルーラー + レーン余白)
  const startScrub = (e: React.PointerEvent) => {
    e.preventDefault();
    onScrub(xToTime(e.clientX));
    const onMove = (me: PointerEvent) => onScrub(xToTime(me.clientX));
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      onScrubCommit();
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const pct = (time: number) => `${(Math.max(0, Math.min(dur, time)) / dur) * 100}%`;

  // カメラキークリック: 要素選択を外し、そのtへスクラブ(シーン設定が見える)
  const onPickCameraKey = (kt: number) => {
    onSelect(null);
    onScrub(kt);
    onScrubCommit();
  };

  const ticks: number[] = [];
  for (let s = 0; s <= Math.floor(dur); s++) ticks.push(s);

  return (
    <div className="tl-root">
      <div className="tl-header">
        <span style={{ fontWeight: 700 }}>タイムライン</span>
        <span style={{ color: "var(--accent)" }}>t = {t.toFixed(2)}s</span>
        <span style={{ marginLeft: "auto" }}>シーン長</span>
        <input
          type="number"
          step="0.5"
          min="0.5"
          className="ui-num"
          style={{ width: "56px" }}
          value={dur}
          onChange={(e) => setSceneDuration(store, scene.id, Number(e.target.value))}
        />
        <span>秒</span>
      </div>

      {/* レーン群 + 全レーン貫通の再生ヘッド */}
      <div className="tl-body">
        {/* 再生ヘッド(トラック領域に重ねる。NAME_W ぶん右にずらす) */}
        <div className="tl-playhead-area" style={{ left: NAME_W }}>
          <div className="tl-playhead" style={{ left: pct(t) }} />
        </div>

        {/* ルーラー */}
        <div className="tl-lane" style={{ height: 20 }}>
          <div className="tl-lanehead" style={{ height: 20 }} />
          <div ref={trackRef} className="tl-ruler" onPointerDown={startScrub}>
            {ticks.map((s) => (
              <div key={s} className="tl-tick" style={{ left: pct(s) }}>
                {s}
              </div>
            ))}
          </div>
        </div>

        {/* カメラレーン(キーがある時のみ) */}
        {scene.camera.length > 0 && (
          <CameraLane
            store={store}
            sceneId={scene.id}
            camera={scene.camera}
            duration={dur}
            pxPerSec={pxPerSec}
            onScrubEmpty={startScrub}
            onPickKey={onPickCameraKey}
          />
        )}

        {/* 要素レーン */}
        {scene.elements.length === 0 && (
          <div style={{ fontSize: "11px", color: "var(--text-dim)", paddingLeft: NAME_W + 8 }}>
            要素がありません
          </div>
        )}
        {scene.elements.map((el) => (
          <ElementLane
            key={el.id}
            store={store}
            sceneId={scene.id}
            el={el}
            duration={dur}
            selected={el.id === selectedId}
            onSelect={onSelect}
            pxPerSec={pxPerSec}
            resolver={resolver}
            thumbs={thumbs}
            onScrubEmpty={startScrub}
          />
        ))}
      </div>
    </div>
  );
}
