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
 *       daily-call-limit: 200      # 사용자별 하루(서울 날짜) LLM 호출 수 상한(도구 반복 포함 호출마다 1)
 *       user-history-limit: 300    # 사용자별 저장 대화 기록 수 상한(모든 인스턴스 합계, 넘으면 가장 오래된 것부터 지움)
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

    /**
     * 응답 시간 제한(초, 스펙 §9.2 「시간 초과 60초」). 질문 하나의 차례 전체(도구 반복 포함)에 걸린다 — 서비스는 다음 LLM 호출 전에
     * 마감이 지났으면 더 부르지 않는다. HTTP 읽기 시간 제한도 같은 값이라 최악은 마감 직전에 시작한 호출 하나만큼 더 걸린다.
     */
    private int timeoutSec = 60;

    /** 답 최대 토큰. */
    private int maxTokens = 1024;

    /**
     * 사용자별 하루(Asia/Seoul 날짜) LLM 호출 수 상한(기본 200). 질문 하나가 도구를 쓰면 여러 번 부르므로 호출마다 센다.
     * 메모리에서 세므로 재기동하면 0 부터, 인스턴스가 여럿이면 인스턴스마다 따로 센다. 0 이하면 기본값.
     */
    private int dailyCallLimit = 200;

    /**
     * 사용자별 저장 대화 기록 수 상한(기본 300) — 모든 위젯 인스턴스 합계. 넘으면 그 사용자의 가장 오래된 기록(C_AT 순)부터 지운다.
     * 인스턴스당 100개 상한은 그대로다. 0 이하면 기본값.
     */
    private int userHistoryLimit = 300;

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
    public int getDailyCallLimit() { return dailyCallLimit; }
    public void setDailyCallLimit(int dailyCallLimit) { this.dailyCallLimit = dailyCallLimit; }
    public int getUserHistoryLimit() { return userHistoryLimit; }
    public void setUserHistoryLimit(int userHistoryLimit) { this.userHistoryLimit = userHistoryLimit; }

    @Override
    public String toString() {
        return "WidgetLlmProperties{provider=" + provider + ", baseUrl=" + baseUrl + ", model=" + model
                + ", apiKey=" + (apiKey == null || apiKey.isBlank() ? "(없음)" : "(설정됨)")
                + ", timeoutSec=" + timeoutSec + ", maxTokens=" + maxTokens
                + ", dailyCallLimit=" + dailyCallLimit + ", userHistoryLimit=" + userHistoryLimit + "}";
    }
}
