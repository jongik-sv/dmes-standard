package com.dongkuk.dmes.mcm.widget.ext;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * 환율·날씨 외부 정보 설정 — yml prefix {@code dmes.widget.ext}(스펙 2026-10-02-widget-admin-generic §8).
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
 *       weather:
 *         base-url: https://api.open-meteo.com/v1/forecast
 * }</pre>
 * 키 값은 로그에 남기지 않는다.
 */
@ConfigurationProperties(prefix = "dmes.widget.ext")
public class WidgetExtProperties {

    /** false 면 외부 HTTP 를 부르지 않는다. */
    private boolean enabled = true;

    private final Exchange exchange = new Exchange();

    private final Weather weather = new Weather();

    public boolean isEnabled() { return enabled; }
    public void setEnabled(boolean enabled) { this.enabled = enabled; }
    public Exchange getExchange() { return exchange; }
    public Weather getWeather() { return weather; }

    /** 환율 제공자 설정. */
    public static class Exchange {

        /** {@code frankfurter}(기본) 또는 {@code koreaexim}. koreaexim 은 키가 있을 때만 쓴다. */
        private String provider = FrankfurterProvider.ID;

        private String frankfurterBaseUrl = "https://api.frankfurter.dev/v1";

        /** 한국수출입은행 인증키. 비면 koreaexim 을 고를 수 없다. */
        private String koreaeximKey = "";

        private String koreaeximBaseUrl = "https://oapi.koreaexim.go.kr/site/program/financial/exchangeJSON";

        public String getProvider() { return provider; }
        public void setProvider(String provider) { this.provider = provider; }
        public String getFrankfurterBaseUrl() { return frankfurterBaseUrl; }
        public void setFrankfurterBaseUrl(String frankfurterBaseUrl) { this.frankfurterBaseUrl = frankfurterBaseUrl; }
        public String getKoreaeximKey() { return koreaeximKey; }
        public void setKoreaeximKey(String koreaeximKey) { this.koreaeximKey = koreaeximKey; }
        public String getKoreaeximBaseUrl() { return koreaeximBaseUrl; }
        public void setKoreaeximBaseUrl(String koreaeximBaseUrl) { this.koreaeximBaseUrl = koreaeximBaseUrl; }
    }

    /** 날씨 제공자 설정. */
    public static class Weather {

        private String baseUrl = "https://api.open-meteo.com/v1/forecast";

        public String getBaseUrl() { return baseUrl; }
        public void setBaseUrl(String baseUrl) { this.baseUrl = baseUrl; }
    }
}
