package com.dongkuk.dmes.mcm.widget.chat.llm;

import java.util.List;

/**
 * LLM 공급자 교체형 계약(스펙 2026-10-02-widget-admin-generic §9.1, W-D27).
 * 구현은 {@link AnthropicLlmClient}·{@link OpenAiCompatibleLlmClient}·{@link FakeLlmClient}. 고르기는 {@code dmes.widget.llm.provider}.
 * 공급자 오류·시간 초과는 {@link LlmException} 으로 던진다. 구현은 키·프롬프트를 로그에 남기지 않는다.
 */
public interface LlmClient {

    /**
     * 한 번 묻고 한 번 받는다(도구 반복은 호출자가 돈다).
     *
     * @param systemPrompt 시스템 프롬프트(없으면 null 또는 빈 값)
     * @param messages     대화(user·assistant·도구 결과) — 오래된 순
     * @param tools        모델에게 줄 도구(없으면 빈 목록)
     */
    LlmReply chat(String systemPrompt, List<LlmMessage> messages, List<LlmTool> tools);
}
