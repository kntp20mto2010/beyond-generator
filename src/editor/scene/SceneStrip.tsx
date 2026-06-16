import { useEffect, useRef, useState } from "react";
import type { DocStore } from "../../core/doc-store.js";
import type { ProjectDoc, SceneDoc, Transition } from "../../core/schema/project.js";
import {
  addScene,
  duplicateScene,
  moveSceneTo,
  removeScene,
  setSceneTransition,
} from "../../core/commands-project.js";
import type { AssetResolver } from "../../io/asset-resolver.js";
import type { ThumbnailService, SceneResolver } from "../thumbs/thumbnail-service.js";
import { Popover } from "../ui/Popover.js";
import { SegmentedButtons } from "../ui/SegmentedButtons.js";
import { IconDuplicate, IconTrash } from "../ui/icons.js";

interface Props {
  store: DocStore<ProjectDoc>;
  doc: ProjectDoc;
  selectedSceneId: string | null;
  playingSceneId: string | null;
  // 通し/シーン再生中の現在時刻(プログレスバー用)。非再生時は無視
  playT: number;
  resolver: AssetResolver;
  thumbs: ThumbnailService;
  onSelect: (id: string) => void;
}

const THUMB_W = 128;
const THUMB_H = 72;

const TRANS_LABELS: Record<Transition["type"], string> = {
  cut: "カット",
  fade: "フェード",
  wipe: "ワイプ",
  slide: "スライド",
};

export function SceneStrip(props: Props) {
  const { store, doc, selectedSceneId, playingSceneId, playT, resolver, thumbs, onSelect } = props;
  // ドラッグ中の挿入先(この index の手前に落とす)。null=非ドラッグ
  const [dropIdx, setDropIdx] = useState<number | null>(null);
  const dragId = useRef<string | null>(null);
  // トランジションチップのポップオーバー対象シーンid
  const [transFor, setTransFor] = useState<string | null>(null);
  const transAnchor = useRef<HTMLButtonElement | null>(null);

  return (
    <div className="scene-strip">
      {doc.scenes.map((scene, idx) => {
        const showInsertBefore = dropIdx === idx && dragId.current !== scene.id;
        return (
          <div key={scene.id} className="scene-strip__slot">
            {/* シーン間トランジションチップ(先頭以外) */}
            {idx > 0 && (
              <TransitionChip
                scene={scene}
                onOpen={(btn) => {
                  transAnchor.current = btn;
                  setTransFor(scene.id);
                }}
              />
            )}
            {showInsertBefore && <div className="scene-strip__insert" />}
            <SceneCard
              scene={scene}
              index={idx}
              selected={scene.id === selectedSceneId}
              playing={scene.id === playingSceneId}
              playT={playT}
              resolver={resolver}
              thumbs={thumbs}
              doc={doc}
              onSelect={() => onSelect(scene.id)}
              onDuplicate={() => duplicateScene(store, scene.id)}
              onRemove={() => removeScene(store, scene.id)}
              onDragStart={() => {
                dragId.current = scene.id;
              }}
              onDragOver={() => setDropIdx(idx)}
              onDragEnd={() => {
                dragId.current = null;
                setDropIdx(null);
              }}
              onDrop={() => {
                const id = dragId.current;
                if (id && id !== scene.id) {
                  const from = doc.scenes.findIndex((s) => s.id === id);
                  // 後方→前方は idx、前方→後方は idx 手前に詰まるため -1 補正
                  const to = from < idx ? idx - 1 : idx;
                  moveSceneTo(store, id, to);
                }
                dragId.current = null;
                setDropIdx(null);
              }}
            />
          </div>
        );
      })}
      {/* 末尾ドロップ位置 */}
      {dropIdx === doc.scenes.length && <div className="scene-strip__insert" />}
      <div
        className="scene-strip__tail"
        onDragOver={(e) => {
          e.preventDefault();
          setDropIdx(doc.scenes.length);
        }}
        onDrop={(e) => {
          e.preventDefault();
          const id = dragId.current;
          if (id) moveSceneTo(store, id, doc.scenes.length - 1);
          dragId.current = null;
          setDropIdx(null);
        }}
      >
        <button className="ui-btn" onClick={() => addScene(store)} title="シーン追加">
          +
        </button>
      </div>

      {transFor && (
        <TransitionPopover
          anchorEl={transAnchor.current}
          scene={doc.scenes.find((s) => s.id === transFor) ?? null}
          onChange={(patch) => setSceneTransition(store, transFor, patch)}
          onClose={() => setTransFor(null)}
        />
      )}
    </div>
  );
}

// --- サムネカード ---

interface CardProps {
  scene: SceneDoc;
  index: number;
  selected: boolean;
  playing: boolean;
  playT: number;
  resolver: AssetResolver;
  thumbs: ThumbnailService;
  doc: ProjectDoc;
  onSelect: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onDragStart: () => void;
  onDragOver: () => void;
  onDragEnd: () => void;
  onDrop: () => void;
}

function SceneCard(props: CardProps) {
  const { scene, index, selected, playing, playT, resolver, thumbs, doc } = props;
  const url = useSceneThumb(doc, scene, resolver, thumbs);
  const progress = playing && scene.duration > 0 ? Math.min(playT / scene.duration, 1) : 0;

  return (
    <div
      className={`scene-card${selected ? " scene-card--sel" : ""}`}
      draggable
      onClick={props.onSelect}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", scene.id);
        props.onDragStart();
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        props.onDragOver();
      }}
      onDragEnd={props.onDragEnd}
      onDrop={(e) => {
        e.preventDefault();
        props.onDrop();
      }}
    >
      <div className="scene-card__thumb" style={{ width: THUMB_W, height: THUMB_H }}>
        {url ? (
          <img src={url} width={THUMB_W} height={THUMB_H} alt={`シーン ${index + 1}`} draggable={false} />
        ) : (
          <span className="scene-card__num">{index + 1}</span>
        )}
        {playing && <div className="scene-card__progress" style={{ width: `${progress * 100}%` }} />}
      </div>
      <div className="scene-card__meta">
        <span className="scene-card__label">シーン {index + 1}・{scene.duration.toFixed(1)}秒</span>
        <span className="scene-card__actions">
          <button className="ui-icon-btn ui-icon-btn--mini" title="複製" onClick={(e) => { e.stopPropagation(); props.onDuplicate(); }}>
            <IconDuplicate />
          </button>
          <button className="ui-icon-btn ui-icon-btn--mini" title="削除" onClick={(e) => { e.stopPropagation(); props.onRemove(); }}>
            <IconTrash />
          </button>
        </span>
      </div>
    </div>
  );
}

// シーンサムネを購読(doc/resolver変化で再生成は ScenePage の invalidate に任せる)
function useSceneThumb(
  doc: ProjectDoc,
  scene: SceneDoc,
  resolver: AssetResolver,
  thumbs: ThumbnailService,
): string | undefined {
  const [url, setUrl] = useState<string | undefined>(() => thumbs.getScene(scene.id));
  useEffect(() => {
    let live = true;
    const sr: SceneResolver = {
      getCharacter: (ref) => resolver.getCharacter(ref),
      getSpriteCharacter: (ref) => resolver.getSpriteCharacter(ref),
      getImageUrl: (path) => resolver.getImageUrl(path),
    };
    const pull = () => {
      void thumbs.renderScene(doc, scene, sr).then((u) => {
        if (live && u) setUrl(u);
      });
    };
    pull();
    const unsub = thumbs.subscribe(pull);
    return () => {
      live = false;
      unsub();
    };
    // doc/scene の参照変化(編集)で再評価。invalidateScene 済みなら再生成される
  }, [doc, scene, resolver, thumbs]);
  return url;
}

// --- トランジションチップ ---

function TransitionChip({ scene, onOpen }: { scene: SceneDoc; onOpen: (btn: HTMLButtonElement) => void }) {
  const trans = scene.transition;
  const isCut = trans.type === "cut";
  return (
    <button
      className={`trans-chip${isCut ? "" : " trans-chip--set"}`}
      title={`トランジション: ${TRANS_LABELS[trans.type]}${isCut ? "" : ` ${trans.dur}s`}`}
      onClick={(e) => {
        e.stopPropagation();
        onOpen(e.currentTarget);
      }}
    >
      {isCut ? "+" : TRANS_LABELS[trans.type].charAt(0)}
    </button>
  );
}

function TransitionPopover({
  anchorEl,
  scene,
  onChange,
  onClose,
}: {
  anchorEl: HTMLButtonElement | null;
  scene: SceneDoc | null;
  onChange: (patch: Partial<Transition>) => void;
  onClose: () => void;
}) {
  if (!scene) return null;
  const trans = scene.transition;
  return (
    <Popover anchorEl={anchorEl} open onClose={onClose} placement="above">
      <div style={{ display: "flex", flexDirection: "column", gap: "6px", minWidth: "200px" }}>
        <SegmentedButtons<Transition["type"]>
          value={trans.type}
          options={[
            { value: "cut", label: "カット" },
            { value: "fade", label: "フェード" },
            { value: "wipe", label: "ワイプ" },
            { value: "slide", label: "スライド" },
          ]}
          onChange={(v) => onChange({ type: v })}
        />
        {trans.type !== "cut" && (
          <div className="ui-row">
            <label>長さ(秒)</label>
            <input
              className="ui-num"
              type="number"
              min={0}
              step={0.1}
              value={trans.dur}
              onChange={(e) => onChange({ dur: Math.max(0, Number(e.target.value) || 0) })}
            />
          </div>
        )}
      </div>
    </Popover>
  );
}
