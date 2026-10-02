"use client";

/**
 * 미디어 위젯 편집기(스펙 2026-10-02-widget-admin-generic §6 media) — 위젯관리 화면 오른쪽 상세 영역에 들어간다.
 * [파일 올리기]는 서버에 올려 `media:{fileId}` 항목을 더하고, [주소로 추가]는 이미지·동영상·YouTube 주소로 항목을 더한다.
 * 항목 캡션·순서·삭제, 넘김 간격, 맞춤 방식을 고친다. 검사는 media.ts validateMediaConfig(저장 막기용으로 onValidate 에 알린다).
 */
import { useEffect, useId, useMemo, useRef, useState, type ChangeEvent } from "react";
import { Button, Input, Select, type SelectOption } from "@dk-oasis/shared/form";
import type { WidgetTypeEditorProps } from "@dk-oasis/shared/widget";

import { MEDIA_CSS, MEDIA_STYLE_HREF } from "./media-styles";
import {
  buildItemFromUrl,
  isRecord,
  mediaSrc,
  moveItem,
  normalizeMediaConfig,
  validateMediaConfig,
  youtubeEmbed,
  type AddKindChoice,
  type MediaConfig,
  type MediaItem,
  type MediaKind,
} from "./media";
import { checkUploadFile, mediaItemFromUpload, UPLOAD_ACCEPT, uploadMedia } from "./upload";

const ADD_KIND_OPTIONS: SelectOption[] = [
  { value: "auto", label: "종류 자동" },
  { value: "image", label: "이미지" },
  { value: "video", label: "동영상" },
];
const FIT_OPTIONS: SelectOption[] = [
  { value: "contain", label: "전체 보이기(여백이 생김)" },
  { value: "cover", label: "칸 채우기(가장자리가 잘림)" },
];
const KIND_LABEL: Record<MediaKind, string> = { image: "이미지", video: "동영상", youtube: "YouTube" };

/** 목록에 보일 출처 문구 — 업로드 파일은 ID 대신 「업로드 파일」. */
function srcLabel(item: MediaItem): string {
  return item.src.startsWith("media:") ? "업로드 파일" : item.src;
}

export default function MediaEditor({ value, onChange, onValidate }: WidgetTypeEditorProps) {
  const cfg = useMemo(() => normalizeMediaConfig(value), [value]);
  const errors = useMemo(() => validateMediaConfig(value), [value]);
  const errorsKey = errors.join("\n");

  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [urlText, setUrlText] = useState("");
  const [urlKind, setUrlKind] = useState<AddKindChoice>("auto");
  const [urlError, setUrlError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const alive = useRef(true);
  // 올리기가 끝나는 사이에 값이 바뀌었을 수 있으므로, 비동기 뒤에는 늘 가장 최근 값·콜백으로 이어서 쓴다.
  const latest = useRef({ value, onChange, onValidate });
  useEffect(() => {
    latest.current = { value, onChange, onValidate };
  });
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // 오류 목록이 바뀔 때만 알린다 — 부모가 onValidate 를 렌더마다 새로 만들어도 되돌려 부르는 고리가 생기지 않는다.
  useEffect(() => {
    latest.current.onValidate?.(errorsKey ? errorsKey.split("\n") : []);
  }, [errorsKey]);

  const ids = useId();
  const fitId = `${ids}-fit`;
  const intervalId = `${ids}-interval`;
  const urlId = `${ids}-url`;
  const kindId = `${ids}-kind`;

  /** 바뀐 칸만 덮어 보낸다. 모르는 키(다른 버전이 넣은 값)는 그대로 둔다. */
  function emit(patch: Partial<MediaConfig>) {
    const { value: current, onChange: send } = latest.current;
    const base = isRecord(current) ? current : {};
    const next = { ...normalizeMediaConfig(current), ...patch };
    send({ ...base, items: next.items, fit: next.fit, intervalSec: next.intervalSec });
  }

  function appendItem(item: MediaItem) {
    emit({ items: [...normalizeMediaConfig(latest.current.value).items, item] });
  }

  function patchItem(index: number, patch: Partial<MediaItem>) {
    emit({ items: cfg.items.map((it, i) => (i === index ? { ...it, ...patch } : it)) });
  }

  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.currentTarget.files?.[0];
    e.currentTarget.value = ""; // 같은 파일을 다시 골라도 변경 이벤트가 오게 한다
    if (!file) return;
    setUploadError(null);
    const problem = checkUploadFile(file);
    if (problem) {
      setUploadError(problem);
      return;
    }
    setUploading(true);
    try {
      const uploaded = await uploadMedia(file);
      if (alive.current) appendItem(mediaItemFromUpload(uploaded));
    } catch (err) {
      if (alive.current) setUploadError(err instanceof Error ? err.message : "업로드에 실패했습니다.");
    } finally {
      if (alive.current) setUploading(false);
    }
  }

  function handleAddUrl() {
    const result = buildItemFromUrl(urlText, urlKind);
    if ("error" in result) {
      setUrlError(result.error);
      return;
    }
    setUrlError(null);
    setUrlText("");
    appendItem(result.item);
  }

  function handleInterval(raw: string) {
    const n = raw.trim() === "" ? Number.NaN : Number(raw);
    emit({ intervalSec: Number.isFinite(n) ? n : undefined });
  }

  return (
    <div className="mwm-ed" data-testid="widget-media-editor">
      <style href={MEDIA_STYLE_HREF} precedence="default">
        {MEDIA_CSS}
      </style>

      <section className="mwm-ed__section">
        <h4 className="mwm-ed__title">파일 올리기</h4>
        <div className="mwm-ed__row">
          <Button variant="primary" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
            파일 올리기
          </Button>
          {uploading && <span className="mwm-ed__busy">올리는 중…</span>}
          <input
            ref={fileInputRef}
            type="file"
            accept={UPLOAD_ACCEPT}
            hidden
            data-testid="widget-media-file"
            onChange={(e) => void handleFile(e)}
          />
        </div>
        <p className="mwm-ed__hint">이미지(png·jpg·gif·webp)는 10MB, 동영상(mp4·webm)은 100MB 까지 올릴 수 있습니다.</p>
        {uploadError && (
          <span className="form-error-message" role="alert">
            {uploadError}
          </span>
        )}
      </section>

      <section className="mwm-ed__section">
        <h4 className="mwm-ed__title">주소로 추가</h4>
        <div className="mwm-ed__row">
          <div className="mwm-ed__grow">
            <Input
              id={urlId}
              value={urlText}
              placeholder="https://… 이미지·동영상·YouTube 주소"
              aria-label="미디어 주소"
              onChange={(v) => {
                setUrlText(v);
                if (urlError) setUrlError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAddUrl();
                }
              }}
            />
          </div>
          <div className="mwm-ed__kind">
            <Select id={kindId} value={urlKind} options={ADD_KIND_OPTIONS} aria-label="주소 종류" onChange={(v) => setUrlKind(v as AddKindChoice)} />
          </div>
          <Button onClick={handleAddUrl}>주소로 추가</Button>
        </div>
        {urlError && (
          <span className="form-error-message" role="alert">
            {urlError}
          </span>
        )}
        <p className="mwm-ed__hint">YouTube 주소는 종류를 자동으로 알아봅니다. 확장자가 없는 이미지·동영상 주소는 종류를 직접 고르세요.</p>
      </section>

      <section className="mwm-ed__section">
        <h4 className="mwm-ed__title">항목 {cfg.items.length}개</h4>
        {cfg.items.length === 0 ? (
          <div className="mwm-ed__empty">아직 항목이 없습니다. 파일을 올리거나 주소를 추가하세요.</div>
        ) : (
          <ol className="mwm-ed__list">
            {cfg.items.map((item, i) => {
              const valid = item.kind === "youtube" ? youtubeEmbed(item.src) !== null : mediaSrc(item.src) !== null;
              const thumb = item.kind === "image" ? mediaSrc(item.src) : null;
              return (
                <li key={i} className={valid ? "mwm-ed__item" : "mwm-ed__item mwm-ed__item--invalid"} data-testid="widget-media-item">
                  <span className="mwm-ed__no">{i + 1}</span>
                  <span className="mwm-ed__thumb">
                    {thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element -- 편집기 미리보기 썸네일(원본 주소를 그대로 보인다).
                      <img src={thumb} alt="" loading="lazy" />
                    ) : (
                      KIND_LABEL[item.kind]
                    )}
                  </span>
                  <div className="mwm-ed__body">
                    <Input
                      value={item.caption ?? ""}
                      maxLength={200}
                      placeholder="캡션(선택)"
                      aria-label={`${i + 1}번째 항목 캡션`}
                      onChange={(v) => patchItem(i, { caption: v === "" ? undefined : v })}
                    />
                    <span className="mwm-ed__src" title={item.src}>
                      {KIND_LABEL[item.kind]} · {srcLabel(item)}
                    </span>
                  </div>
                  <span className="mwm-ed__actions">
                    <Button ariaLabel={`${i + 1}번째 항목 위로`} disabled={i === 0} onClick={() => emit({ items: moveItem(cfg.items, i, -1) })}>
                      ↑
                    </Button>
                    <Button
                      ariaLabel={`${i + 1}번째 항목 아래로`}
                      disabled={i === cfg.items.length - 1}
                      onClick={() => emit({ items: moveItem(cfg.items, i, 1) })}
                    >
                      ↓
                    </Button>
                    <Button variant="danger" ariaLabel={`${i + 1}번째 항목 삭제`} onClick={() => emit({ items: cfg.items.filter((_, j) => j !== i) })}>
                      삭제
                    </Button>
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <section className="mwm-ed__section">
        <h4 className="mwm-ed__title">보이는 방식</h4>
        <div className="mwm-ed__settings">
          <div className="mwm-ed__field">
            <label className="mwm-ed__label" htmlFor={intervalId}>
              넘김 간격(초)
            </label>
            <Input id={intervalId} type="number" min={3} value={cfg.intervalSec ?? ""} placeholder="8" onChange={handleInterval} />
            <p className="mwm-ed__hint">항목이 둘 이상일 때 자동으로 넘어가는 간격입니다(3초 이상, 비우면 8초). 동영상은 재생이 끝나면 넘어갑니다.</p>
          </div>
          <div className="mwm-ed__field">
            <label className="mwm-ed__label" htmlFor={fitId}>
              맞춤 방식
            </label>
            <Select id={fitId} value={cfg.fit} options={FIT_OPTIONS} onChange={(v) => emit({ fit: v === "cover" ? "cover" : "contain" })} />
          </div>
        </div>
      </section>

      {errors.length > 0 && (
        <ul className="mwm-ed__errors" role="alert" data-testid="widget-media-errors">
          {errors.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
