package com.dongkuk.dmes.mcm.widget.chat.llm;

import java.util.List;

/**
 * 공급자 중립 대화 한 칸. 공급자 구현이 자기 형식(Anthropic messages · OpenAI chat messages)으로 바꾼다.
 *
 * @param role         {@link #USER}·{@link #ASSISTANT}·{@link #TOOL}
 * @param text         글(user·assistant)
 * @param toolCalls    assistant 가 요청한 도구 호출(도구 반복 중에만)
 * @param toolResults  도구 결과(role=tool)
 * @param rawAssistant 공급자 원본 assistant 내용({@link LlmReply#rawAssistant()}) — 있으면 그대로 되돌려 준다
 */
public record LlmMessage(String role, String text, List<LlmToolCall> toolCalls, List<LlmToolResult> toolResults,
                         Object rawAssistant) {

    public static final String USER = "user";
    public static final String ASSISTANT = "assistant";
    public static final String TOOL = "tool";

    public LlmMessage {
        text = text == null ? "" : text;
        toolCalls = toolCalls == null ? List.of() : List.copyOf(toolCalls);
        toolResults = toolResults == null ? List.of() : List.copyOf(toolResults);
    }

    public static LlmMessage user(String text) {
        return new LlmMessage(USER, text, List.of(), List.of(), null);
    }

    public static LlmMessage assistant(String text) {
        return new LlmMessage(ASSISTANT, text, List.of(), List.of(), null);
    }

    /** 도구 반복 중 모델 답을 그대로 대화에 붙인다. */
    public static LlmMessage assistantReply(LlmReply reply) {
        return new LlmMessage(ASSISTANT, reply.text(), reply.toolCalls(), List.of(), reply.rawAssistant());
    }

    public static LlmMessage toolResults(List<LlmToolResult> results) {
        return new LlmMessage(TOOL, "", List.of(), results, null);
    }
}
