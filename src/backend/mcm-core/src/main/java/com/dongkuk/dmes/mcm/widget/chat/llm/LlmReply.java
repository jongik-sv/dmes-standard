package com.dongkuk.dmes.mcm.widget.chat.llm;

import java.util.List;

/**
 * 모델 답 한 번.
 *
 * @param text         답 글(텍스트 블록을 이은 것, 없으면 빈 문자열)
 * @param toolCalls    도구 호출 요청(없으면 빈 목록)
 * @param stopReason   공급자가 준 끝난 이유(end_turn·tool_use·stop·tool_calls 등, 모르면 null)
 * @param rawAssistant 공급자 원본 assistant 내용(Anthropic content 배열). 도구 반복 중 같은 공급자에게 assistant 차례를
 *                     그대로 되돌려 줄 때 쓴다(thinking 블록·서명 보존). OpenAI 호환·가짜·시험은 null(다시 짠다)
 */
public record LlmReply(String text, List<LlmToolCall> toolCalls, String stopReason, Object rawAssistant) {

    public LlmReply {
        text = text == null ? "" : text;
        toolCalls = toolCalls == null ? List.of() : List.copyOf(toolCalls);
    }

    public boolean hasToolCalls() {
        return !toolCalls.isEmpty();
    }

    public static LlmReply ofText(String text) {
        return new LlmReply(text, List.of(), "end_turn", null);
    }

    public static LlmReply ofToolCalls(String text, List<LlmToolCall> calls) {
        return new LlmReply(text, calls, "tool_use", null);
    }
}
