"use client";

/**
 * 메모장 렌더러(스펙 2026-10-02-widget-admin-generic §17).
 * - 공용 메모(scope=shared): 정의의 content 를 형식대로 보이기만 한다. 편집 버튼 없음.
 * - 개인 메모(scope=personal): 마운트 때 load → 보기 모드(+[편집]). 편집 모드는 형식 선택·입력칸·글자 수·[저장]·[취소].
 *   저장이 실패하면 아래 [저장]·[취소] 줄의 왼쪽에 오류 문구를 보이고 쓰던 글은 그대로 둔다(입력칸 위에 두면 md 편집기가 하한 높이
 *   때문에 줄지 못해 [저장] 줄이 스크롤 밖으로 밀린다).
 * - 입력칸은 공지 작성 화면(m-mls NoticeBodyEditor)과 같다: md = shared MarkdownField(서식·MD 두 방식, 도구 막대 inline),
 *   text·html = shared Textarea(html 은 고정폭). 형식을 바꿔도 쓰던 글은 그대로다(편집기만 바뀐다).
 *   MarkdownField 는 인스턴스마다 key(instanceId)로 새로 그린다(되돌리기 기록이 다른 글로 넘어가지 않게). 새 편집을 시작할 때 새로
 *   그려지는 것은 key 때문이 아니라 보기·편집이 서로 다른 가지라 [편집]마다 편집 가지가 새로 마운트되기 때문이다.
 *   저장 중에는 editable 을 끄지 않고(편집기가 내려가 되돌리기 기록이 사라진다) 감싸개를 잠근다(aria-busy·inert — 누르기·Tab 이 막힌다).
 *   그동안 들어온 변경(IME 조합 확정 등 inert 를 뚫고 온 입력)도 버리지 않고 draft 에 그대로 담는다 — shared MarkdownEditor 는 onChange 를 부르기
 *   전에 자기 값(lastSynced)을 먼저 갱신하므로, 부모가 값을 버리면 편집기에는 글이 남고 draft 에는 없어 어긋난다.
 *   [배치 편집] 중 md 편집 칸(contenteditable)에서 누른 Esc 는 배치 편집 취소(shared WidgetWorkspace 의 document keydown, 입력칸·메뉴·
 *   대화상자만 거른다)로 새지 않게 감싸개에서 끊는다.
 * - 관리 화면 미리보기(저장소 없음)는 load·save 를 부르지 않고 「미리보기에서는 저장하지 않습니다」만 보인다.
 * - 위젯관리 [기본 배치] 보드(WidgetBoardModeContext 값이 "preview")도 미리보기와 같은 경로다 — 실제 칸이라 저장하면 관리자 본인 메모가 되므로
 *   load·save 를 부르지 않고 「기본 배치 화면에서는 개인 메모를 쓰지 않습니다(사용자가 홈에서 씁니다)」만 보인다. 홈(provider 밖)은 그대로 실제 메모다.
 * 형식별 보기는 shared NoticeBodyView 한 곳이 맡는다: TEXT = 줄바꿈 유지 글, MD = 글(md) 위젯과 같은 MarkdownView,
 * HTML = html 위젯(allowScript=false)과 같은 DOMPurify 정화(script·on*·style·iframe 제거).
 * 기록을 처음 불러오는 일만 틀 상태(useWidgetStatus)로 알린다. 저장 오류를 틀의 error 로 알리면 틀이 본문을 숨겨
 * 쓰던 글이 안 보이므로 저장 오류는 이 화면 안에서 보인다.
 */
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Button, Select, Textarea } from "@dk-oasis/shared/form";
import { MarkdownField } from "@dk-oasis/shared/markdown-editor";
import { NoticeBodyView } from "@dk-oasis/shared/notice-body-view";
import { useWidgetStatus, type WidgetProps } from "@dk-oasis/shared/widget";

import { useWidgetBoardMode } from "@/lib/widget-board-mode";

import { ContentStyle } from "../_content/styles";
import { fetchMemo, saveMemo } from "./api";
import {
  canSave,
  countLabel,
  isBlankMemo,
  isLiveMemo,
  isMemoFormat,
  MEMO_BOARD_PREVIEW_TEXT,
  MEMO_EMPTY_VIEW_TEXT,
  MEMO_FORMATS,
  MEMO_LOAD_ERROR,
  MEMO_MD_MODE_STORAGE_KEY,
  MEMO_PREVIEW_TEXT,
  MEMO_SAVE_ERROR,
  MEMO_SHARED_EMPTY_TEXT,
  memoErrorMessage,
  readMemoConfig,
  validateDraft,
  viewFormat,
  type MemoFormat,
  type MemoRecord,
} from "./memo-model";
import { MEMO_CSS, MEMO_STYLE_HREF } from "./memo-styles";

function MemoStyle() {
  return (
    <style href={MEMO_STYLE_HREF} precedence="default">
      {MEMO_CSS}
    </style>
  );
}

export default function MemoRenderer(props: WidgetProps) {
  const cfg = readMemoConfig(props.definition);
  if (cfg.scope === "shared") {
    if (!cfg.content.trim()) {
      return (
        <>
          <ContentStyle />
          <div className="mcm-wt-state">{MEMO_SHARED_EMPTY_TEXT}</div>
        </>
      );
    }
    return <NoticeBodyView value={cfg.content} format={viewFormat(cfg.format)} testId="widget-memo-shared" />;
  }
  return <PersonalMemo {...props} />;
}

type Mode = "view" | "edit";

/**
 * md 편집 칸의 Esc 를 위(배치 편집 취소)로 올리지 않는다. preventDefault 는 하지 않는다(편집기 자신의 Esc 처리를 건드리지 않는다).
 * shared WidgetWorkspace 는 document 에 bubble 단계 keydown 을 걸어 두는데(capture 아님), 포털(Next 앱 라우터)은 React 뿌리가
 * document 라 React 의 합성 stopPropagation 만으로는 같은 document 의 뒤에 등록된 리스너를 못 막는다 — 네이티브 이벤트의
 * stopImmediatePropagation 도 부른다(React 리스너가 먼저 등록되므로 뒤 리스너가 막힌다). 뿌리가 div 이면 stopPropagation 이 막는다.
 */
function stopEscape(e: KeyboardEvent<HTMLElement>) {
  if (e.key !== "Escape") return;
  e.stopPropagation();
  e.nativeEvent.stopImmediatePropagation();
}

function PersonalMemo({ instanceId, widgetId, definition, refreshKey }: WidgetProps) {
  const setStatus = useWidgetStatus();
  const boardMode = useWidgetBoardMode();
  /** 서버와 실제로 주고받는 칸 — 관리 화면 미리보기·기본 배치 보드(boardMode="preview")는 아니다. */
  const live = boardMode === "live" && isLiveMemo(widgetId, instanceId);
  const initialFormat = readMemoConfig(definition).format;

  const [memo, setMemo] = useState<MemoRecord | null>(null);
  const [loaded, setLoaded] = useState(!live);
  const [attempt, setAttempt] = useState(0);
  const [mode, setMode] = useState<Mode>("view");
  const [draftFormat, setDraftFormat] = useState<MemoFormat>(initialFormat);
  const [draftContent, setDraftContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  /** 요청 세대 — 불러오기·저장이 시작될 때 올리고, 늦게 온 이전 응답은 버린다. 인스턴스가 바뀌거나 사라질 때도 올린다. */
  const genRef = useRef(0);
  /** 편집 중이거나 저장 중 — 이때 새로 고침 신호는 메모를 다시 읽지 않는다(쓰던 글·저장 흐름을 건드리지 않도록). */
  const lockRef = useRef(false);

  useEffect(
    () => () => {
      genRef.current += 1;
    },
    [instanceId]
  );

  const load = useCallback(async () => {
    if (!live) {
      setMemo(null);
      setLoaded(true);
      setStatus({ kind: "ready" });
      return;
    }
    const gen = ++genRef.current;
    setStatus({ kind: "loading" });
    try {
      const found = await fetchMemo(instanceId);
      if (gen !== genRef.current) return;
      setMemo(found);
      setLoaded(true);
      setStatus({ kind: "ready" });
    } catch {
      if (gen !== genRef.current) return;
      setStatus({ kind: "error", message: MEMO_LOAD_ERROR, retry: () => setAttempt((a) => a + 1) });
    }
  }, [instanceId, live, setStatus]);

  useEffect(() => {
    if (lockRef.current) return;
    void load();
  }, [load, refreshKey, attempt]);

  const startEdit = () => {
    if (!live || !loaded) return;
    lockRef.current = true;
    setDraftFormat(memo?.format ?? initialFormat);
    setDraftContent(memo?.content ?? "");
    setErrorText(null);
    setMode("edit");
  };

  const cancel = () => {
    if (saving) return;
    lockRef.current = false;
    setErrorText(null);
    setMode("view");
  };

  const save = async () => {
    if (!live || !canSave(draftContent, saving)) return;
    const problem = validateDraft(draftContent);
    if (problem) {
      setErrorText(problem);
      return;
    }
    const gen = ++genRef.current; // 진행 중이던 불러오기 응답은 버린다
    setStatus({ kind: "ready" }); // 버린 불러오기가 남긴 「불러오는 중」 표시를 풀지 못하므로 여기서 푼다
    setSaving(true);
    setErrorText(null);
    try {
      const saved = await saveMemo({ instId: instanceId, defId: widgetId, format: draftFormat, content: draftContent });
      if (gen !== genRef.current) return;
      setMemo(saved);
      lockRef.current = false;
      setMode("view");
    } catch (e) {
      if (gen !== genRef.current) return;
      setErrorText(memoErrorMessage(e, MEMO_SAVE_ERROR));
    } finally {
      setSaving(false);
    }
  };

  const over = validateDraft(draftContent) !== null;
  /** 보기 모드에 그릴 메모 — 없거나 내용이 공백뿐이면 null(「메모가 없습니다」). */
  const shown = isBlankMemo(memo) ? null : memo;

  return (
    <div className="mcm-memo" data-testid="widget-memo">
      <ContentStyle />
      <MemoStyle />
      {mode === "view" ? (
        <>
          <div className="mcm-memo__bar mcm-memo__bar--end">
            <Button size="mini" onClick={startEdit} disabled={!live || !loaded} data-testid="memo-edit">
              편집
            </Button>
          </div>
          <div className="mcm-memo__view" data-testid="memo-view">
            {!live ? (
              <div className="mcm-wt-state" data-testid="memo-preview-hint">
                {boardMode === "preview" ? MEMO_BOARD_PREVIEW_TEXT : MEMO_PREVIEW_TEXT}
              </div>
            ) : !loaded ? null : shown === null ? (
              <div className="mcm-wt-state" data-testid="memo-empty">
                {MEMO_EMPTY_VIEW_TEXT}
              </div>
            ) : (
              <NoticeBodyView value={shown.content} format={viewFormat(shown.format)} testId="widget-memo-body" />
            )}
          </div>
        </>
      ) : (
        <div className="mcm-memo__edit" data-testid="memo-editing">
          <div className="mcm-memo__bar">
            <Select
              style={{ width: 110 }}
              aria-label="형식"
              value={draftFormat}
              options={MEMO_FORMATS.map((f) => ({ value: f.value, label: f.label }))}
              disabled={saving}
              onChange={(v) => {
                if (isMemoFormat(v)) setDraftFormat(v);
              }}
              data-testid="memo-format"
            />
            <span className={over ? "mcm-memo__count mcm-memo__count--over" : "mcm-memo__count"} data-testid="memo-count">
              {countLabel(draftContent)}
            </span>
          </div>
          {draftFormat === "md" ? (
            <div
              className={saving ? "mcm-memo__md mcm-memo__md--locked" : "mcm-memo__md"}
              aria-busy={saving || undefined}
              inert={saving || undefined}
              onKeyDown={stopEscape}
            >
              <MarkdownField
                key={instanceId}
                value={draftContent}
                editable
                fill
                ariaLabel="메모 내용"
                modeStorageKey={MEMO_MD_MODE_STORAGE_KEY}
                testId="memo-input-md"
                onChange={setDraftContent}
              />
            </div>
          ) : (
            <div className={draftFormat === "text" ? "mcm-memo__field" : "mcm-memo__field mcm-memo__field--code"}>
              <Textarea
                value={draftContent}
                rows={6}
                aria-label="메모 내용"
                readOnly={saving}
                spellCheck={draftFormat === "text"}
                onChange={setDraftContent}
                data-testid="memo-input"
              />
            </div>
          )}
          <div className="mcm-memo__bar mcm-memo__bar--end">
            {errorText && (
              <div className="mcm-memo__error" role="alert" data-testid="memo-error">
                {errorText}
              </div>
            )}
            <div className="mcm-memo__actions">
              <Button variant="primary" onClick={() => void save()} disabled={!canSave(draftContent, saving)} data-testid="memo-save">
                저장
              </Button>
              <Button onClick={cancel} disabled={saving} data-testid="memo-cancel">
                취소
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
