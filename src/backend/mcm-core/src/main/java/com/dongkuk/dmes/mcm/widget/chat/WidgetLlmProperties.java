package com.dongkuk.dmes.mcm.widget.chat;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * 챗봇 LLM 공급자 설정 — yml prefix {@code dmes.widget.llm}(스펙 2026-10-02-widget-admin-generic §9.1).
 *
 * <pre>{@code
 * dmes:
 *   widget:
 *     llm:
 *       provider: anthropic        # 빈 값 = 가짜(「AI 연결이 설정되지 않았습니다」), openai = OpenAI 호환(사내 Ollama·vLLM)
 *       base-url:                  # anthropic 기본 https://api.anthropic.com · openai 는 필수(예: http://host:11434/v1)
 *       model:                     # anthropic 기본 claude-sonnet-5-5 · openai 는 필수
 *       api-key: ${DMES_LLM_API_KEY:}
 *       timeout-sec: 60
 *       max-tokens: 1024
 * }</pre>
 * 키는 환경 변수로만 넣는다. {@link #toString()} 은 키를 보이지 않는다(로그 유출 방지).
 */
@ConfigurationProperties(prefix = "dmes.widget.llm")
public class WidgetLlmProperties {

    /** anthropic · openai · 빈 값(가짜). */
    private String provider = "";

    private String baseUrl = "";

    private String model = "";

    private String apiKey = "";

    /** 공급자 한 번 호출의 응답 시간 제한(초). */
    private int timeoutSec = 60;

    /** 답 최대 토큰. */
    private int maxTokens = 1024;

    public String getProvider() { return provider; }
    public void setProvider(String provider) { this.provider = provider; }
    public String getBaseUrl() { return baseUrl; }
    public void setBaseUrl(String baseUrl) { this.baseUrl = baseUrl; }
    public String getModel() { return model; }
    public void setModel(String model) { this.model = model; }
    public String getApiKey() { return apiKey; }
    public void setApiKey(String apiKey) { this.apiKey = apiKey; }
    public int getTimeoutSec() { return timeoutSec; }
    public void setTimeoutSec(int timeoutSec) { this.timeoutSec = timeoutSec; }
    public int getMaxTokens() { return maxTokens; }
    public void setMaxTokens(int maxTokens) { this.maxTokens = maxTokens; }

    @Override
    public String toString() {
        return "WidgetLlmProperties{provider=" + provider + ", baseUrl=" + baseUrl + ", model=" + model
                + ", apiKey=" + (apiKey == null || apiKey.isBlank() ? "(없음)" : "(설정됨)")
                + ", timeoutSec=" + timeoutSec + ", maxTokens=" + maxTokens + "}";
    }
}
