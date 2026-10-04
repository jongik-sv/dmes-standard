"use client";

/**
 * 미디어 위젯 렌더러(스펙 2026-10-02-widget-admin-generic §6 media).
 * 항목 하나면 그대로, 여럿이면 간격(최소 3초)으로 자동 넘김 + 좌우 버튼 + 점. 마우스를 올리면 시간 넘김이 멈춘다.
 * 동영상은 자동 넘김 중에 자동 재생(음소거)하고 재생이 끝나면 다음으로 간다. YouTube 는 재생 끝을 알 수 없어 시간으로 넘긴다.
 * 판단(주소 변환·간격·넘김 방식)은 media.ts 의 순수 함수다.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react";
import { WidgetHeaderActions, useWidgetVisible, type WidgetProps } from "@dk-oasis/shared/widget";

import { MEDIA_CSS, MEDIA_STYLE_HREF } from "./media-styles";
import {
  clampIndex,
  clampIntervalSec,
  mediaSrc,
  nextIndex,
  normalizeMediaConfig,
  prevIndex,
  slideAdvance,
  slideTimerReady,
  youtubeEmbed,
  type MediaFit,
  type MediaItem,
} from "./media";

const MISSING_MESSAGE = "파일을 찾을 수 없습니다";

interface StageMediaProps {
  item: MediaItem;
  fit: MediaFit;
  /** 항목이 여럿일 때만 동영상이 저절로 시작하고, 끝나면 다음으로 넘어간다. */
  slideshow: boolean;
  onFail: () => void;
  onLoad: () => void;
  onEnded: () => void;
}

function StageMedia({ item, fit, slideshow, onFail, onLoad, onEnded }: StageMediaProps) {
  const mediaClass = fit === "cover" ? "mwm__media mwm__media--cover" : "mwm__media";
  const title = item.caption?.trim() || undefined;
  if (item.kind === "youtube") {
    const embed = youtubeEmbed(item.src);
    if (!embed) return <div className="mwm__state">{MISSING_MESSAGE}</div>;
    return (
      <iframe
        className="mwm__media"
        src={embed}
        title={title ?? "YouTube 동영상"}
        allow="encrypted-media; picture-in-picture"
        allowFullScreen
      />
    );
  }
  const src = mediaSrc(item.src);
  if (!src) return <div className="mwm__state">{MISSING_MESSAGE}</div>;
  if (item.kind === "video") {
    return (
      <video
        className={mediaClass}
        src={src}
        controls
        muted
        playsInline
        autoPlay={slideshow}
        preload="metadata"
        onError={onFail}
        onEnded={slideshow ? onEnded : undefined}
      />
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- 업로드·외부 주소 원본을 그대로 보이는 위젯이라 next/image 최적화를 쓰지 않는다.
    <img
      className={mediaClass}
      src={src}
      alt={title ?? ""}
      draggable={false}
      // 이미 받아진(캐시) 이미지는 onLoad 가 이미 지나갔을 수 있어 붙을 때 한 번 확인한다.
      ref={(el) => {
        if (el?.complete && el.naturalWidth > 0) onLoad();
      }}
      onLoad={onLoad}
      onError={onFail}
    />
  );
}

export default function MediaRenderer({ definition }: WidgetProps) {
  const cfg = useMemo(() => normalizeMediaConfig(definition), [definition]);
  const { items, fit } = cfg;
  const count = items.length;
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  // 숨은 탭·화면 밖·hidden 문서에서는 슬라이드를 넘기지 않는다(Screen-Performance-Guide R14).
  const visible = useWidgetVisible(rootRef);

  const current = clampIndex(index, count);
  const item = items[current];
  const itemKey = item ? `${current}:${item.kind}:${item.src}` : "";
  const mode = slideAdvance(item, failedKey === itemKey, count);
  const intervalMs = clampIntervalSec(cfg.intervalSec) * 1000;
  const timerReady = slideTimerReady(item, loadedKey === itemKey, failedKey === itemKey);

  // 항목을 옮길 때마다 실패 표시를 지운다 — 한 바퀴 돌아 다시 오면 다시 불러온다(잠깐의 네트워크 오류가 계속 남지 않게).
  const goTo = useCallback((to: (i: number) => number) => {
    setFailedKey(null);
    setIndex(to);
  }, []);
  const goNext = useCallback(() => goTo((i) => nextIndex(clampIndex(i, count), count)), [goTo, count]);
  const goPrev = useCallback(() => goTo((i) => prevIndex(clampIndex(i, count), count)), [goTo, count]);

  // 시간 넘김 — 항목이 바뀔 때마다(itemKey) 처음부터 다시 센다. 마우스가 올라가 있거나 보이지 않으면 세지 않고(다시 보이면 처음부터 센다), 이미지는 다 받아진 뒤에 센다.
  useEffect(() => {
    if (mode !== "timer" || paused || !visible || !timerReady) return;
    const timer = window.setTimeout(goNext, intervalMs);
    return () => window.clearTimeout(timer);
  }, [mode, paused, visible, timerReady, intervalMs, goNext, itemKey]);

  const caption = item?.caption?.trim();
  const multiple = count > 1;

  return (
    <div
      ref={rootRef}
      className="mwm"
      data-testid="widget-media"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <style href={MEDIA_STYLE_HREF} precedence="default">
        {MEDIA_CSS}
      </style>
      {multiple && (
        <WidgetHeaderActions>
          <span className="mwm__counter">
            {current + 1} / {count}
          </span>
        </WidgetHeaderActions>
      )}
      <div className="mwm__stage">
        {item ? (
          failedKey === itemKey ? (
            <div className="mwm__state">{MISSING_MESSAGE}</div>
          ) : (
            <StageMedia
              key={itemKey}
              item={item}
              fit={fit}
              slideshow={multiple}
              onFail={() => setFailedKey(itemKey)}
              onLoad={() => setLoadedKey(itemKey)}
              onEnded={goNext}
            />
          )
        ) : (
          <div className="mwm__state">표시할 미디어가 없습니다</div>
        )}
        {multiple && (
          <>
            <button type="button" className="mwm__nav mwm__nav--prev" aria-label="이전" onClick={goPrev}>
              <IconChevronLeft size={18} />
            </button>
            <button type="button" className="mwm__nav mwm__nav--next" aria-label="다음" onClick={goNext}>
              <IconChevronRight size={18} />
            </button>
          </>
        )}
      </div>
      {(caption || multiple) && (
        <div className="mwm__foot">
          <span className="mwm__caption">{caption}</span>
          {multiple && (
            <span className="mwm__dots">
              {items.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  className={i === current ? "mwm__dot mwm__dot--active" : "mwm__dot"}
                  aria-label={`${i + 1}번째 항목`}
                  aria-current={i === current ? "true" : undefined}
                  onClick={() => goTo(() => i)}
                />
              ))}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
