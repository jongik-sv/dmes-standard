package com.dongkuk.dmes.mcm.widget.ext;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * 환율 외부 정보 설정 — yml prefix {@code dmes.widget.ext}(스펙 2026-10-02-widget-admin-generic §8).
 * 날씨는 위젯이 직접 부르지 않고 수집 작업 값만 읽으므로(2026-10-09-weather-collect-design) 설정이 없다.
 *
 * <pre>{@code
 * dmes:
 *   widget:
 *     ext:
 *       enabled: true                 # false 면 외부 호출 없이 DB·캐시 값만(망 분리 환경)
 *       exchange:
 *         provider: frankfurter       # frankfurter(기본) · koreaexim(키가 있을 때만)
 *         frankfurter-base-url: https://api.frankfurter.dev/v1
 *         koreaexim-key: ""
 *         koreaexim-base-url: https://oapi.koreaexim.go.kr/site/program/financial/exchangeJSON
 *         user-fetch-limit: 10        # 사용자별 외부 호출을 일으키는 요청 수 상한(구간마다)
 *         user-fetch-window-sec: 600  # 위 상한의 구간(초)
 *         retry-after-fail-sec: 600   # 실패·빈 결과·오늘 값 없음 뒤 같은 통화·날짜를 다시 묻기까지(초)
 *         mdm-schema: MDMAPUSER       # 환율 위젯이 읽는 MDM 환율 마스터(TB_MDM_DATA_ITEM)의 스키마
 * }</pre>
 * 키 값은 로그에 남기지 않는다.
 */
@ConfigurationProperties(prefix = "dmes.widget.ext")
public class WidgetExtProperties {

    /** false 면 외부 HTTP 를 부르지 않는다. */
    private boolean enabled = true;

    private final Exchange exchange = new Exchange();

    public boolean isEnabled() { return enabled; }
    public void setEnabled(boolean enabled) { this.enabled = enabled; }
    public Exchange getExchange() { return exchange; }

    /** 환율 제공자 설정. */
    public static class Exchange {

        /** {@code frankfurter}(기본) 또는 {@code koreaexim}. koreaexim 은 키가 있을 때만 쓴다. */
        private String provider = FrankfurterProvider.ID;

        private String frankfurterBaseUrl = "https://api.frankfurter.dev/v1";

        /** 한국수출입은행 인증키. 비면 koreaexim 을 고를 수 없다. */
        private String koreaeximKey = "";

        private String koreaeximBaseUrl = "https://oapi.koreaexim.go.kr/site/program/financial/exchangeJSON";

        /** 사용자별로 외부 호출을 일으키는 요청 수 상한(구간마다, 기본 10). DB 값만으로 답하는 요청은 세지 않는다. 0 이하면 기본값. */
        private int userFetchLimit = 10;

        /** {@link #userFetchLimit} 의 구간(초, 기본 600 = 10분). 0 이하면 기본값. */
        private int userFetchWindowSec = 600;

        /**
         * 같은 (제공자, 통화, 날짜)를 다시 묻기까지 기다리는 시간(초, 기본 600 = 10분) — 호출 실패·일부만 받음, 그리고 오늘 날짜 값이 아직
         * 없을 때(고시 전). 제공자가 답했는데 지난 날짜 값이 없으면(휴일) 그날은 끝까지 다시 묻지 않는다. 0 이하면 기본값.
         */
        private int retryAfterFailSec = 600;

        /**
         * 환율 위젯이 읽는 MDM 환율 마스터({@code TB_MDM_DATA_ITEM}, 마스터 {@code FX_RATE})의 스키마 이름(기본 {@code MDMAPUSER}).
         * 영문 대문자로 시작하는 대문자·숫자·밑줄 30자 이내여야 한다({@link FxMasterReader}).
         */
        private String mdmSchema = "MDMAPUSER";

        public String getProvider() { return provider; }
        public void setProvider(String provider) { this.provider = provider; }
        public String getFrankfurterBaseUrl() { return frankfurterBaseUrl; }
        public void setFrankfurterBaseUrl(String frankfurterBaseUrl) { this.frankfurterBaseUrl = frankfurterBaseUrl; }
        public String getKoreaeximKey() { return koreaeximKey; }
        public void setKoreaeximKey(String koreaeximKey) { this.koreaeximKey = koreaeximKey; }
        public String getKoreaeximBaseUrl() { return koreaeximBaseUrl; }
        public void setKoreaeximBaseUrl(String koreaeximBaseUrl) { this.koreaeximBaseUrl = koreaeximBaseUrl; }
        public int getUserFetchLimit() { return userFetchLimit; }
        public void setUserFetchLimit(int userFetchLimit) { this.userFetchLimit = userFetchLimit; }
        public int getUserFetchWindowSec() { return userFetchWindowSec; }
        public void setUserFetchWindowSec(int userFetchWindowSec) { this.userFetchWindowSec = userFetchWindowSec; }
        public int getRetryAfterFailSec() { return retryAfterFailSec; }
        public void setRetryAfterFailSec(int retryAfterFailSec) { this.retryAfterFailSec = retryAfterFailSec; }
        public String getMdmSchema() { return mdmSchema; }
        public void setMdmSchema(String mdmSchema) { this.mdmSchema = mdmSchema; }
    }
}
