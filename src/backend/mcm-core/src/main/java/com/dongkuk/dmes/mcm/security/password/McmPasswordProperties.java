package com.dongkuk.dmes.mcm.security.password;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * 비밀번호 정책 설정 — 갭 #9, #10. yml prefix {@code mcm.password}.
 *
 * <p>예시 application.yml:
 * <pre>{@code
 * mcm:
 *   password:
 *     expiry-days: 90
 *     history-count: 5
 *     min-length: 8
 *     complexity-pattern: "^(?=.*[A-Za-z])(?=.*\\d).+$"
 *     legacy-grace-days: 60
 * }</pre>
 */
@ConfigurationProperties(prefix = "mcm.password")
public class McmPasswordProperties {

    /** 비밀번호 만료 일수. 0 이하면 만료 검증 비활성. */
    private int expiryDays = 90;

    /** 마지막 N개 동일 비번 거부. 0 이하면 이력 비교 비활성. */
    private int historyCount = 5;

    /** 최소 길이. 0 이하면 길이 검증 비활성. */
    private int minLength = 8;

    /**
     * 복잡도 정규식. null/blank 면 검증 비활성.
     * default = 영문 + 숫자 동시 포함.
     */
    private String complexityPattern = "^(?=.*[A-Za-z])(?=.*\\d).+$";

    /**
     * legacy 사용자 (passSetDd 미설정) 유예 일수. (결정 0-3 = B 유예 옵션)
     * - 0: 즉시 만료 (강제 변경 옵션 A)
     * - 양수 N: passSetDd 기준 N일 동안 유예
     * - -1: legacy 유예 정책 미적용 (passSetDd 가 null 이면 만료로 보지 않음)
     */
    private int legacyGraceDays = 60;

    public int getExpiryDays() { return expiryDays; }
    public void setExpiryDays(int expiryDays) { this.expiryDays = expiryDays; }
    public int getHistoryCount() { return historyCount; }
    public void setHistoryCount(int historyCount) { this.historyCount = historyCount; }
    public int getMinLength() { return minLength; }
    public void setMinLength(int minLength) { this.minLength = minLength; }
    public String getComplexityPattern() { return complexityPattern; }
    public void setComplexityPattern(String complexityPattern) { this.complexityPattern = complexityPattern; }
    public int getLegacyGraceDays() { return legacyGraceDays; }
    public void setLegacyGraceDays(int legacyGraceDays) { this.legacyGraceDays = legacyGraceDays; }
}
