package com.dongkuk.dmes.mcm.widget.chat.llm;

/**
 * 도구 실행 결과 한 건 — 모델에게 돌려준다.
 *
 * @param toolCallId 응답하는 {@link LlmToolCall#id()}
 * @param content    결과 본문(JSON 문자열 또는 오류 문구)
 * @param error      도구 오류인지(허용 안 된 defId 등 — 대화를 끊지 않고 모델에게 알린다)
 */
public record LlmToolResult(String toolCallId, String content, boolean error) {}
