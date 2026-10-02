package com.dongkuk.dmes.mcm.widget.chat.llm;

import java.util.Map;

/**
 * 모델이 요청한 도구 호출 한 건.
 *
 * @param id    공급자가 준 호출 ID(Anthropic tool_use.id · OpenAI tool_calls[].id) — 결과를 돌려줄 때 쓴다
 * @param name  도구 이름
 * @param input 입력(JSON 객체를 Map 으로)
 */
public record LlmToolCall(String id, String name, Map<String, Object> input) {

    public LlmToolCall {
        input = input == null ? Map.of() : input;
    }
}
