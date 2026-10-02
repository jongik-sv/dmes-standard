package com.dongkuk.dmes.mcm.widget.chat.llm;

/**
 * 공급자 오류·시간 초과·응답 형식 오류. 메시지에는 HTTP 상태·오류 종류만 담고 키·프롬프트·본문은 담지 않는다.
 */
public class LlmException extends RuntimeException {

    public LlmException(String message) {
        super(message);
    }

    public LlmException(String message, Throwable cause) {
        super(message, cause);
    }
}
