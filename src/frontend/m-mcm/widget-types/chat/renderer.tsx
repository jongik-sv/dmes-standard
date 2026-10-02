"use client";

/**
 * AI 챗봇 렌더러(스펙 2026-10-02-widget-admin-generic §6·§9, 계획 Task 14).
 * - 처음에 history(instanceId). 기록이 없으면 정의의 welcome 을 도우미 말풍선처럼 보인다(저장 안 함).
 * - 사용자 말풍선은 오른쪽, 도우미는 왼쪽(MarkdownView). 답의 links 는 [열기] → openPortalPage.
 * - 입력: Enter 보내기·Shift+Enter 줄바꿈(한글 조합 중 Enter 는 보내지 않는다), 2000자 제한·남은 글자.
 * - 보내는 동안 「답을 기다리는 중…」·입력 막기(readOnly 라 초점이 유지된다). 실패하면 입력 칸 위 오류, 보낸 질문은 목록에 남긴다.
 * - 제목 줄 [새 대화] = 확인 뒤 reset. 새 메시지가 오면 맨 아래로 스크롤.
 * - 기록을 처음 불러오는 일만 틀 상태(useWidgetStatus)로 알린다. 보내기 실패를 틀의 error 로 알리면 틀이 본문 전체를 숨기므로
 *   전송 오류는 이 화면 안에서 보인다. definition 은 화면에 필요한 welcome 만 쓴다(서버 전용 키는 widgetDef/list 가 지운다).
 * 로직(병합·제한·링크·요청 모양)은 chat-model.ts 순수 함수다.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Button, Textarea } from "@dk-oasis/shared/form";
import { MarkdownView } from "@dk-oasis/shared/markdown-editor";
import { useMessage } from "@dk-oasis/shared/message-provider";
import { openPortalPage, useWidgetStatus, WidgetHeaderActions, type WidgetProps } from "@dk-oasis/shared/widget";

import { fetchChatHistory, resetChat, sendChatMessage } from "./api";
import { CHAT_CSS, CHAT_STYLE_HREF } from "./chat-styles";
import {
  appendPending,
  canSend,
  CHAT_DEFAULT_ERROR,
  CHAT_MAX_LENGTH,
  chatErrorMessage,
  displayItems,
  failPending,
  isLiveChat,
  remainingChars,
  resolvePending,
  restoreDraft,
  resolveWelcome,
  shouldSendOnKey,
  type ChatMessage,
} from "./chat-model";

const LOW_REMAINING = 100;

export default function ChatRenderer({ instanceId, widgetId, definition, refreshKey }: WidgetProps) {
  const setStatus = useWidgetStatus();
  const { showMessage } = useMessage();
  const live = isLiveChat(widgetId, definition, instanceId);
  const welcome = resolveWelcome(definition);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  // 서버와 대화하는 위젯은 기록을 읽은 뒤에야 첫 인사를 정한다(처음에 보였다 사라지는 깜빡임 방지). 미리보기는 바로 보인다.
  const [showWelcome, setShowWelcome] = useState(!live);
  const [loaded, setLoaded] = useState(!live);
  const [attempt, setAttempt] = useState(0);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  const listRef = useRef<HTMLDivElement>(null);
  /** 요청 세대 — 불러오기·보내기·지우기가 시작될 때 올리고, 늦게 온 이전 응답은 버린다. 인스턴스가 바뀌거나 사라질 때도 올린다. */
  const genRef = useRef(0);
  /** 보내는 중·지우는 중 — 이때 새로 고침 신호는 기록을 다시 읽지 않는다(낙관적 메시지를 지우지 않도록). */
  const busyRef = useRef(false);

  useEffect(
    () => () => {
      genRef.current += 1;
    },
    [instanceId]
  );

  const load = useCallback(async () => {
    if (!live) {
      setMessages([]);
      setShowWelcome(true);
      setLoaded(true);
      setStatus({ kind: "ready" });
      return;
    }
    const gen = ++genRef.current;
    setStatus({ kind: "loading" });
    try {
      const list = await fetchChatHistory(instanceId);
      if (gen !== genRef.current) return;
      setMessages(list);
      setShowWelcome(list.length === 0);
      setLoaded(true);
      setStatus({ kind: "ready" });
    } catch {
      if (gen !== genRef.current) return;
      setStatus({ kind: "error", message: "대화 기록을 불러오지 못했습니다.", retry: () => setAttempt((a) => a + 1) });
    }
  }, [instanceId, live, setStatus]);

  useEffect(() => {
    if (busyRef.current) return;
    void load();
  }, [load, refreshKey, attempt]);

  const items = useMemo(() => displayItems({ messages, welcome, showWelcome }), [messages, welcome, showWelcome]);

  // 새 메시지·답을 기다리는 줄·오류가 생기면 맨 아래로.
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [items.length, sending, errorText]);

  const send = useCallback(async () => {
    if (!live || !loaded || busyRef.current || !canSend(draft, false)) return;
    const text = draft.trim();
    busyRef.current = true;
    const gen = ++genRef.current; // 진행 중이던 불러오기 응답은 버린다
    setErrorText(null);
    setSending(true);
    setStatus({ kind: "ready" });
    setMessages((m) => appendPending(m, text));
    setDraft("");
    try {
      const reply = await sendChatMessage(instanceId, widgetId, text);
      if (gen !== genRef.current) return;
      setMessages((m) => resolvePending(m, reply));
    } catch (e) {
      if (gen !== genRef.current) return;
      setMessages((m) => failPending(m));
      setDraft((current) => restoreDraft(current, text)); // 다시 치지 않도록 보낸 글을 되돌린다(그사이 새로 쓴 글이 없을 때만).
      setErrorText(chatErrorMessage(e, CHAT_DEFAULT_ERROR));
    } finally {
      busyRef.current = false;
      setSending(false);
    }
  }, [draft, instanceId, live, loaded, setStatus, widgetId]);

  const reset = useCallback(async () => {
    if (!live || busyRef.current) return;
    busyRef.current = true;
    const gen = ++genRef.current;
    setErrorText(null);
    setResetting(true);
    setStatus({ kind: "ready" });
    try {
      await resetChat(instanceId);
      if (gen !== genRef.current) return;
      setMessages([]);
      setShowWelcome(true);
    } catch (e) {
      if (gen !== genRef.current) return;
      setErrorText(chatErrorMessage(e, "대화를 지우지 못했습니다. 잠시 뒤 다시 시도하세요."));
    } finally {
      busyRef.current = false;
      setResetting(false);
    }
  }, [instanceId, live, setStatus]);

  const confirmReset = () =>
    showMessage({
      title: "확인",
      message: "대화 기록을 모두 지우고 새로 시작할까요?",
      alertType: "confirm",
      onConfirm: () => void reset(),
    });

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (shouldSendOnKey({ key: e.key, shiftKey: e.shiftKey, isComposing: e.nativeEvent.isComposing, keyCode: e.keyCode })) {
      e.preventDefault();
      void send();
    }
  };

  const busy = sending || resetting;
  const remaining = remainingChars(draft);

  return (
    <div className="mcm-chat" data-testid="chat-widget">
      <style href={CHAT_STYLE_HREF} precedence="default">
        {CHAT_CSS}
      </style>
      <WidgetHeaderActions>
        <Button size="mini" onClick={confirmReset} disabled={!live || busy || messages.length === 0} data-testid="chat-reset">
          새 대화
        </Button>
      </WidgetHeaderActions>
      <div ref={listRef} className="mcm-chat__list" role="log" aria-live="polite" aria-label="대화 내용" data-testid="chat-list">
        {items.map((item) => (
          <div key={item.key} className={`mcm-chat__row mcm-chat__row--${item.role}`} data-role={item.role}>
            <div
              className={`mcm-chat__bubble mcm-chat__bubble--${item.role}${item.pending ? " mcm-chat__bubble--pending" : ""}`}
              data-testid={item.welcome ? "chat-welcome" : "chat-bubble"}
            >
              {item.role === "assistant" ? <MarkdownView value={item.content} testId="chat-md" /> : item.content}
            </div>
            {item.links.length > 0 && (
              <div className="mcm-chat__links">
                {item.links.map((link) => (
                  <div key={link.pageId} className="mcm-chat__link">
                    <span className="mcm-chat__link-title" title={link.title}>
                      {link.title}
                    </span>
                    <Button size="mini" onClick={() => openPortalPage(link.pageId)} data-testid="chat-link-open">
                      열기
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
        {sending && (
          <div className="mcm-chat__wait" role="status" data-testid="chat-wait">
            답을 기다리는 중…
          </div>
        )}
      </div>
      <div className="mcm-chat__composer">
        {errorText && (
          <div className="mcm-chat__error" role="alert" data-testid="chat-error">
            {errorText}
          </div>
        )}
        {!live && <div className="mcm-chat__hint">미리보기에서는 대화할 수 없습니다. 저장한 뒤 홈에서 사용하세요.</div>}
        <Textarea
          value={draft}
          rows={2}
          maxLength={CHAT_MAX_LENGTH}
          placeholder="메시지를 입력하세요 (Enter 보내기, Shift+Enter 줄바꿈)"
          aria-label="메시지 입력"
          disabled={!live || !loaded}
          readOnly={busy}
          onChange={setDraft}
          onKeyDown={onKeyDown}
          data-testid="chat-input"
        />
        <div className="mcm-chat__bar">
          <span className={remaining <= LOW_REMAINING ? "mcm-chat__count mcm-chat__count--low" : "mcm-chat__count"}>
            {`${remaining.toLocaleString("ko-KR")}자 남음`}
          </span>
          <Button variant="primary" onClick={() => void send()} disabled={!live || !loaded || !canSend(draft, busy)} data-testid="chat-send">
            보내기
          </Button>
        </div>
      </div>
    </div>
  );
}
