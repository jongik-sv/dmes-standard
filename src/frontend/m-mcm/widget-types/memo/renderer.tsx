"use client";

/**
 * 메모장 렌더러(스펙 2026-10-02-widget-admin-generic §17).
 * - 공용 메모(scope=shared): 정의의 content 를 형식대로 보이기만 한다. 편집 버튼 없음.
 * - 개인 메모(scope=personal): 마운트 때 load → 보기 모드(+[편집]). 편집 모드는 형식 선택·입력칸·글자 수·[저장]·[취소].
 *   저장이 실패하면 아래 [저장]·[취소] 줄의 왼쪽에 오류 문구를 보이고 쓰던 글은 그대로 둔다(입력칸 위에 두면 md 편집기가 하한 높이
 *   때문에 줄지 못해 [저장] 줄이 스크롤 밖으로 밀린다).
 * - 입력칸은 공지 작성 화면(lsh/noticeMgmt NoticeBodyEditor)과 같다: md = shared MarkdownField(서식·MD 두 방식, 도구 막대 inline),
 *   text·html = shared Textarea(html 은 고정폭). 형식을 바꿔도 쓰던 글은 그대로다(편집기만 바뀐다).
 *   MarkdownField 는 인스턴스마다 key(instanceId)로 새로 그린다(되돌리기 기록이 다른 글로 넘어가지 않게). 새 편집을 시작할 때 새로
 *   그려지는 것은 key 때문이 아니라 보기·편집이 서로 다른 가지라 [편집]마다 편집 가지가 새로 마운트되기 때문이다.
 *   저장 중에는 editable 을 끄지 않고(편집기가 내려가 되돌리기 기록이 사라진다) 감싸개를 잠근다(aria-busy·inert — 누르기·Tab 이 막힌다).
 *   그동안 들어온 변경(IME 조합 확정 등 inert 를 뚫고 온 입력)도 버리지 않고 draft 에 그대로 담는다 — shared MarkdownEditor 는 onChange 를 부르기
 *   전에 자기 값(lastSynced)을 먼저 갱신하므로, 부모가 값을 버리면 편집기에는 글이 남고 draft 에는 없어 어긋난다.
 *   [배치 편집] 중 md 편집 칸(contenteditable)에서 누른 Esc 는 배치 편집 취소(shared WidgetWorkspace 의 document keydown, 입력칸·메뉴·
 *   대화상자만 거른다)로 새지 않게 감싸개에서 끊는다.
 * - 메모장 제목(2026-10-03): 편집 화면 맨 위에 「제목」 입력칸(최대 40자, 코드 포인트 기준)을 두고 [저장] 때 내용과 함께 보낸다. 비우면 위젯 정의 이름으로
 *   돌아간다(placeholder 가 그 이름을 알린다). 틀 제목은 **저장된 제목**으로만 바꾼다(useWidgetTitle) — 편집 중 입력은 미리 보이지 않고, 공용 메모·미리보기·
 *   기본 배치 보드(live=false)에서는 바꾸지 않는다. 임시본에도 제목을 담아 편집 중 제목이 복원된다.
 * - 관리 화면 미리보기(저장소 없음)는 load·save 를 부르지 않고 「미리보기에서는 저장하지 않습니다」만 보인다.
 * - 임시 저장(쓰다 만 글): 편집 중 글·형식이 바뀌면 300ms 디바운스로 이 브라우저(localStorage
 *   `dmes:widget:memo-draft:v1:{encodeURIComponent(userId)}:{encodeURIComponent(instanceId)}`)에 { format, content, baseHash(불러온 메모의 내용 해시),
 *   savedAt } 를 쓴다. 위젯이 사라질 때와 페이지가 사라지거나 가려질 때(pagehide·visibilitychange hidden) 못 쓴 값은 바로 쓰고, 저장 성공·[취소]·[버리기]에 지운다.
 *   [이어 쓰기] 뒤의 [취소]도 확인 없이 임시본을 지운다(스펙 §17.5). 임시본은 savedAt 으로부터 7일만 둔다(읽을 때 지난 것은 지우고, 사용자가 확인되면
 *   한 번 훑어 7일 지난 것과 다른 사용자의 것을 지운다 — 공용 PC 에서 앞 사용자의 평문이 남지 않게).
 *   [편집]을 누를 때 서버 메모와 다른 임시본이 있으면 편집 영역 위에 「저장하지 않은 글이 있습니다(시각)」와 [이어 쓰기]·[버리기]를 보이고(그 뒤 서버 메모가
 *   바뀌었으면 한 문장 더), 보기 모드에서는 [편집] 옆에 「쓰다 만 글 있음」을 보인다. 안내에서 고르기 전에는 새로 쓰는 글이 옛 임시본을 덮지 않도록 쓰지 않고,
 *   그동안의 [취소]도 옛 임시본을 지우지 않는다. 고르기 전에는 입력칸·형식 선택·[저장]을 잠근다(쓴 글이 임시 저장되지 않아 탭 전환에 사라지지 않게, 고르기 없이 저장해 옛 임시본이
 *   지워지지 않게) — [취소]·[이어 쓰기]·[버리기]만 열려 있다. 미리보기·기본 배치 보드(live=false)에서는 읽지도 쓰지도 않는다.
 *   사용자 ID 는 shared 포털 셸의 확인된 사용자(memo-user.ts)만 쓴다. 확인이 끝나기 전(pending)에는 [편집]을 막는다 — 편집 도중 사용자가 늦게 확인돼
 *   옛 임시본 안내가 뜨며 입력이 잠기는 일을 없앤다. 확인이 실패로 끝나면(failed) 임시 저장 없이 편집을 허용한다. 편집은 시작할 때 정한 키(editKey)만
 *   끝까지 쓴다 — 편집 도중 사용자 ID 가 바뀌거나 사라져도 그 편집의 임시 저장·삭제는 같은 키로 이어진다.
 * - 위젯관리 [기본 배치] 보드(WidgetBoardModeContext 값이 "preview")도 미리보기와 같은 경로다 — 실제 칸이라 저장하면 관리자 본인 메모가 되므로
 *   load·save 를 부르지 않고 「기본 배치 화면에서는 개인 메모를 쓰지 않습니다(사용자가 홈에서 씁니다)」만 보인다. 홈(provider 밖)은 그대로 실제 메모다.
 * 형식별 보기는 shared NoticeBodyView 한 곳이 맡는다: TEXT = 줄바꿈 유지 글, MD = 글(md) 위젯과 같은 MarkdownView,
 * HTML = html 위젯(allowScript=false)과 같은 DOMPurify 정화(script·on*·style·iframe 제거).
 * 기록을 처음 불러오는 일만 틀 상태(useWidgetStatus)로 알린다. 저장 오류를 틀의 error 로 알리면 틀이 본문을 숨겨
 * 쓰던 글이 안 보이므로 저장 오류는 이 화면 안에서 보인다.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Button, Input, Select, Textarea } from "@dk-oasis/shared/form";
import { MarkdownField } from "@dk-oasis/shared/markdown-editor";
import { NoticeBodyView } from "@dk-oasis/shared/notice-body-view";
import { useWidgetRename, useWidgetStatus, useWidgetTitle, type WidgetProps } from "@dk-oasis/shared/widget";

import { useWidgetBoardMode } from "@/lib/widget-board-mode";

import { ContentStyle } from "../_content/styles";
import { fetchMemo, saveMemo } from "./api";
import { readDraft, removeDraft, sweepDrafts, writeDraft } from "./memo-draft-storage";
import {
  canSave,
  clampTitle,
  classifyDraft,
  countLabel,
  draftDiffers,
  isDraftWritable,
  isBlankMemo,
  isLiveMemo,
  isMemoFormat,
  MEMO_BOARD_PREVIEW_TEXT,
  MEMO_DRAFT_FLAG_TEXT,
  MEMO_EMPTY_VIEW_TEXT,
  MEMO_FORMATS,
  MEMO_LOAD_ERROR,
  MEMO_MD_MODE_STORAGE_KEY,
  MEMO_PREVIEW_TEXT,
  MEMO_SAVE_ERROR,
  MEMO_SHARED_EMPTY_TEXT,
  memoBaseHash,
  memoDraftKey,
  memoDraftNoticeText,
  memoEditBase,
  memoErrorMessage,
  normalizeTitle,
  readMemoConfig,
  restorableDraft,
  syncDraftAfterRename,
  validateDraft,
  validateTitle,
  viewFormat,
  type MemoEditBase,
  type MemoFormat,
  type MemoRecord,
  type RestorableDraft,
} from "./memo-model";
import { MEMO_CSS, MEMO_STYLE_HREF } from "./memo-styles";
import { useConfirmedUser } from "./memo-user";
import { useMemoDraftWriter } from "./use-memo-draft";

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

function PersonalMemo({ instanceId, widgetId, definition, refreshKey, title: defTitle }: WidgetProps) {
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
  const [draftTitle, setDraftTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  /** 틀 제목 줄에서 이름을 바꾸는 저장이 진행 중이다 — 이때는 [편집]을 열지 않고 이름 바꾸기를 한 번 더 받지 않는다. */
  const [renaming, setRenaming] = useState(false);

  // 임시 저장(쓰다 만 글) — 사용자를 모르거나(확인 전·확인 실패) live 가 아니면 키가 null 이라 읽지도 쓰지도 않는다.
  const { userId, status: userStatus } = useConfirmedUser(live);
  const draftKey = live ? memoDraftKey(userId, instanceId) : null;
  /** [편집]을 열 수 있는가 — 실제 칸이고 불러왔고 사용자 확인이 끝났다(성공이든 실패든. 확인 중에 열면 도중에 키가 생겨 입력이 잠긴다). */
  const canEdit = live && loaded && userStatus !== "pending" && !renaming;
  const writer = useMemoDraftWriter();
  // 틀 제목 — 저장된 제목이 있을 때만 정의 이름 대신 쓴다(실제 칸이 아니면 늘 정의 이름). 값이 바뀌거나 위젯이 사라지면 틀이 되돌린다.
  useWidgetTitle(live ? (memo?.title ?? null) : null);
  /** 편집을 시작할 때의 서버 메모 기준(형식·내용·해시). */
  const [base, setBase] = useState<MemoEditBase | null>(null);
  /**
   * 이 편집이 임시본을 읽고 쓰고 지우는 키 — [편집]을 누를 때 한 번 정한다(사용자를 몰랐으면 null = 임시 저장 없이 편집).
   * 지금의 draftKey 를 따라가지 않는다: 편집 도중 사용자 확인 결과가 바뀌어도(늦은 확인·ID 사라짐) 입력이 잠기거나 임시 저장이 끊기지 않는다.
   */
  const [editKey, setEditKey] = useState<string | null>(null);
  /** 안내에서 고르기를 기다리는 임시본 — 있는 동안 새 임시 저장은 쉰다. */
  const [restore, setRestore] = useState<RestorableDraft | null>(null);
  /** 사용자가 글·형식을 바꿨다 — 편집을 열어 서버 메모를 넣은 것만으로는 임시본을 쓰지 않는다. */
  const [touched, setTouched] = useState(false);

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

  // 사용자가 확인되면 한 번 임시본 키를 훑어 7일 지난 것과 다른 사용자의 것을 지운다(로그아웃해도 평문이 남는 것을 줄인다).
  useEffect(() => {
    if (live && userId) sweepDrafts(userId);
  }, [live, userId]);

  /** 보기 모드의 임시본 — pending 이면 「쓰다 만 글 있음」, 서버 메모와 같아진(stale) 것은 아래 효과가 지운다. */
  const viewDraft = useMemo(
    () =>
      draftKey && loaded && mode === "view"
        ? classifyDraft(readDraft(draftKey), memo, initialFormat)
        : { pending: null, stale: false },
    [draftKey, loaded, mode, memo, initialFormat]
  );
  useEffect(() => {
    if (viewDraft.stale) removeDraft(draftKey);
  }, [viewDraft.stale, draftKey]);

  // 편집 중 글·형식이 바뀌면 디바운스로 임시 저장한다. 서버 메모와 같아지면 임시본을 지운다. 20,000자를 넘는 글은 쓰지 않는다.
  useEffect(() => {
    if (mode !== "edit" || !touched || restore !== null || !base || !editKey) return;
    if (!isDraftWritable(draftContent)) return;
    writer.schedule(
      editKey,
      draftDiffers({ format: draftFormat, content: draftContent, title: draftTitle }, base)
        ? { format: draftFormat, content: draftContent, title: draftTitle, baseHash: base.hash, savedAt: Date.now() }
        : null
    );
  }, [mode, touched, restore, base, editKey, draftFormat, draftContent, draftTitle, writer]);

  const startEdit = () => {
    if (!canEdit) return;
    const nextBase = memoEditBase(memo, initialFormat);
    lockRef.current = true;
    setBase(nextBase);
    // 이 편집의 임시본 키를 정하고 그 키의 임시본을 지금 한 번 찾는다 — 첫 편집 화면부터 안내(잠금)가 맞게 나온다.
    setEditKey(draftKey);
    setRestore(restorableDraft(readDraft(draftKey), nextBase));
    setTouched(false);
    setDraftFormat(nextBase.format);
    setDraftContent(nextBase.content);
    setDraftTitle(nextBase.title);
    setErrorText(null);
    setMode("edit");
  };

  const changeFormat = (next: MemoFormat) => {
    setDraftFormat(next);
    setTouched(true);
  };

  const changeContent = (next: string) => {
    setDraftContent(next);
    setTouched(true);
  };

  /** 제목은 40자(코드 포인트)를 넘겨 쓰지 못하게 자른다 — 서버·검사와 같은 기준이라 HTML maxLength(UTF-16 단위)는 쓰지 않는다. */
  const changeTitle = (next: string) => {
    setDraftTitle(clampTitle(next));
    setTouched(true);
  };

  /** 안내의 [이어 쓰기] — 임시본의 형식·글·제목을 편집기에 넣는다(저장된 임시본은 그대로 둔다). 제목이 없는 옛 임시본은 저장된 제목을 그대로 쓴다. */
  const resumeDraft = () => {
    if (!restore || saving) return;
    setDraftFormat(restore.draft.format);
    setDraftContent(restore.draft.content);
    setDraftTitle(clampTitle(restore.draft.title ?? base?.title ?? ""));
    setTouched(false);
    setRestore(null);
  };

  /** 안내의 [버리기] — 임시본을 지우고 서버 메모로 계속 쓴다. */
  const discardDraft = () => {
    if (!restore || saving) return;
    writer.drop();
    removeDraft(editKey);
    setRestore(null);
  };

  const cancel = () => {
    if (saving) return;
    writer.drop();
    // 안내에서 아직 고르지 않았다면 옛 임시본은 사용자가 정할 때까지 남긴다(보기 모드의 「쓰다 만 글 있음」).
    if (restore === null) removeDraft(editKey);
    lockRef.current = false;
    setRestore(null);
    setErrorText(null);
    setMode("view");
  };

  const save = async () => {
    if (!live || restore !== null || !canSave(draftContent, saving, draftTitle)) return;
    const problem = validateDraft(draftContent) ?? validateTitle(draftTitle);
    if (problem) {
      setErrorText(problem);
      return;
    }
    const gen = ++genRef.current; // 진행 중이던 불러오기 응답은 버린다
    setStatus({ kind: "ready" }); // 버린 불러오기가 남긴 「불러오는 중」 표시를 풀지 못하므로 여기서 푼다
    setSaving(true);
    setErrorText(null);
    try {
      const saved = await saveMemo({
        instId: instanceId,
        defId: widgetId,
        format: draftFormat,
        content: draftContent,
        title: normalizeTitle(draftTitle) || null,
      });
      if (gen !== genRef.current) return;
      setMemo(saved);
      writer.drop();
      removeDraft(editKey);
      lockRef.current = false;
      setRestore(null);
      setMode("view");
    } catch (e) {
      if (gen !== genRef.current) return;
      setErrorText(memoErrorMessage(e, MEMO_SAVE_ERROR));
    } finally {
      setSaving(false);
    }
  };

  /**
   * 틀 제목 줄의 이름 바꾸기(2026-10-05) — 편집 모드 없이 제목만 바꾼다. 보기 모드에서만 켜고(편집 모드는 자기 제목 입력칸이 있다),
   * 저장 직전에 서버 메모를 다시 읽어 그 형식·내용을 그대로 실어 기존 saveMemo 로 보낸다(서버는 제목만 보내는 경로가 없고 충돌 감지도 없어서,
   * 화면의 옛 글을 보내면 다른 탭·브라우저에서 고친 내용을 덮는다). 저장이 성공하면 setMemo → useWidgetTitle 경로로 틀 제목이 바뀐다.
   * 실패하면 던진 문장을 틀이 입력칸 아래에 알린다. 저장 동안 새로 고침이 응답을 가로채지 않게 lockRef 를 건다(편집 저장과 같다).
   */
  const renameTitle = async (raw: string) => {
    if (!live || !loaded || mode !== "view" || lockRef.current) throw new Error(MEMO_SAVE_ERROR);
    const title = normalizeTitle(raw);
    const problem = validateTitle(title);
    if (problem) throw new Error(problem);
    const before = memo;
    const gen = ++genRef.current; // 진행 중이던 새로 고침 응답은 버린다
    lockRef.current = true;
    setStatus({ kind: "ready" }); // 버린 불러오기가 남긴 「불러오는 중」 표시를 풀지 못하므로 여기서 푼다
    setRenaming(true);
    try {
      const current = await fetchMemo(instanceId);
      if (gen !== genRef.current) return; // 위젯이 사라졌거나 다른 인스턴스가 됐다 — 정상 종료(저장하지 않는다)
      const saved = await saveMemo({
        instId: instanceId,
        defId: widgetId,
        format: current?.format ?? initialFormat,
        content: current?.content ?? "",
        title: title || null,
      });
      if (gen !== genRef.current) return; // 저장은 끝났지만 화면이 이미 없다 — 상태를 쓰지 않는 정상 종료
      setMemo(saved);
      // 쓰다 만 글의 제목·기준이 옛 제목에 묶여 있으면 새 제목으로 따라가게 한다(이어 쓰기가 제목을 되돌리지 않도록).
      // 서버 메모가 화면의 것과 달랐으면(다른 곳에서 바뀜) 기준 해시는 옮기지 않아 그 안내가 남는다.
      const synced = syncDraftAfterRename(readDraft(draftKey), before, saved, memoBaseHash(current) === memoBaseHash(before));
      if (synced) writeDraft(draftKey, synced);
    } catch (e) {
      throw new Error(memoErrorMessage(e, MEMO_SAVE_ERROR));
    } finally {
      lockRef.current = false;
      setRenaming(false);
    }
  };
  useWidgetRename(live && loaded && mode === "view" ? renameTitle : null);

  const over = validateDraft(draftContent) !== null;
  /** 제목 오류 — clampTitle 이 입력을 정리하므로 보통 null 이다(남는 경우의 안전망). 있으면 [저장]도 막힌다(canSave). */
  const titleError = validateTitle(draftTitle);
  /**
   * 입력 잠금 — 저장 중이거나, 안내(restore)에서 이어 쓰기·버리기를 아직 고르지 않았을 때. 고르기 전에 쓴 글은 옛 임시본을 덮지 않으려 임시 저장되지 않으므로
   * (그러면 쓴 글이 탭 전환에 사라진다) 입력을 막고, [저장]도 막는다(서버 글을 그대로 다시 저장해 옛 임시본이 고르기 없이 지워지지 않게). [취소]는 열어 둔다.
   */
  const choosing = restore !== null;
  const inputLocked = saving || choosing;
  /** 보기 모드에 그릴 메모 — 없거나 내용이 공백뿐이면 null(「메모가 없습니다」). */
  const shown = isBlankMemo(memo) ? null : memo;

  return (
    <div className="mcm-memo" data-testid="widget-memo">
      <ContentStyle />
      <MemoStyle />
      {mode === "view" ? (
        <>
          <div className="mcm-memo__bar mcm-memo__bar--end">
            {viewDraft.pending && (
              <span className="mcm-memo__draft-flag" data-testid="memo-draft-flag">
                {MEMO_DRAFT_FLAG_TEXT}
              </span>
            )}
            <Button size="mini" onClick={startEdit} disabled={!canEdit} data-testid="memo-edit">
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
          {restore && (
            <div className="mcm-memo__draft-notice" role="status" data-testid="memo-draft-notice">
              <span className="mcm-memo__draft-text" data-testid="memo-draft-text">
                {memoDraftNoticeText(restore.draft.savedAt, restore.changedElsewhere)}
              </span>
              <span className="mcm-memo__actions">
                <Button size="mini" onClick={resumeDraft} disabled={saving} data-testid="memo-draft-resume">
                  이어 쓰기
                </Button>
                <Button size="mini" onClick={discardDraft} disabled={saving} data-testid="memo-draft-discard">
                  버리기
                </Button>
              </span>
            </div>
          )}
          <div className="mcm-memo__bar mcm-memo__bar--head">
            <div className="mcm-memo__title">
              <Input
                value={draftTitle}
                aria-label="메모 제목"
                placeholder="제목"
                title={defTitle ? `비우면 위젯 이름 「${defTitle}」으로 돌아갑니다` : "비우면 위젯 이름으로 돌아갑니다"}
                error={titleError ?? undefined}
                readOnly={inputLocked}
                onChange={changeTitle}
                data-testid="memo-title-input"
              />
            </div>
            <Select
              style={{ width: 110 }}
              aria-label="형식"
              value={draftFormat}
              options={MEMO_FORMATS.map((f) => ({ value: f.value, label: f.label }))}
              disabled={inputLocked}
              onChange={(v) => {
                if (isMemoFormat(v)) changeFormat(v);
              }}
              data-testid="memo-format"
            />
          </div>
          {draftFormat === "md" ? (
            <div
              className={inputLocked ? "mcm-memo__md mcm-memo__md--locked" : "mcm-memo__md"}
              aria-busy={saving || undefined}
              inert={inputLocked || undefined}
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
                onChange={changeContent}
              />
            </div>
          ) : (
            <div className={draftFormat === "text" ? "mcm-memo__field" : "mcm-memo__field mcm-memo__field--code"}>
              <Textarea
                value={draftContent}
                rows={6}
                aria-label="메모 내용"
                readOnly={inputLocked}
                spellCheck={draftFormat === "text"}
                onChange={changeContent}
                data-testid="memo-input"
              />
            </div>
          )}
          <div className="mcm-memo__bar mcm-memo__bar--end mcm-memo__bar--foot">
            {errorText && (
              <div className="mcm-memo__error" role="alert" data-testid="memo-error">
                {errorText}
              </div>
            )}
            <span className={over ? "mcm-memo__count mcm-memo__count--over" : "mcm-memo__count"} data-testid="memo-count">
              {countLabel(draftContent)}
            </span>
            <div className="mcm-memo__actions">
              <Button variant="primary" onClick={() => void save()} disabled={!canSave(draftContent, saving, draftTitle) || choosing} data-testid="memo-save">
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
