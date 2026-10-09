package com.dongkuk.dmes.mcm.widget.ext;

import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import com.dongkuk.dmes.mcm.common.exception.ErrorCode;
import com.dongkuk.dmes.mcm.common.security.SecurityIdentity;
import com.dongkuk.dmes.mcm.widget.ext.dto.WidgetExtExchangeRequest;
import com.dongkuk.dmes.mcm.widget.ext.dto.WidgetExtWeatherRequest;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

/**
 * 환율·날씨 위젯 — OASIS {@code widgetExt}(스펙 2026-10-02-widget-admin-generic §5.1, AUTH_ONLY).
 * 사용자 데이터가 없는 공용 정보다. 환율은 MDM 환율 마스터를 읽기만 하며(쓰기 없음), 인증 사용자 ID 는 인증 컨텍스트에서 얻는다.
 * {@code @Transactional} 을 붙이지 않는다.
 */
@Service("widgetExtService")
public class WidgetExtService {

    private static final Logger log = LoggerFactory.getLogger(WidgetExtService.class);

    private final ExchangeService exchangeService;
    private final WeatherService weatherService;
    private final SecurityIdentity securityIdentity;
    private final FxMasterReader fxMasterReader;
    private final WeatherCollectReader weatherCollectReader;

    @Autowired
    public WidgetExtService(ExchangeService exchangeService, WeatherService weatherService, SecurityIdentity securityIdentity,
                            FxMasterReader fxMasterReader, WeatherCollectReader weatherCollectReader) {
        this.exchangeService = exchangeService;
        this.weatherService = weatherService;
        this.securityIdentity = securityIdentity;
        this.fxMasterReader = fxMasterReader;
        this.weatherCollectReader = weatherCollectReader;
    }

    /**
     * {@code { latest: [{cur, rate, diff, date}], history: [{date, cur, rate}] }} (+ stale·disabled).
     * 통화·기간은 사용 중인 환율 위젯 정의의 범위 안이어야 한다({@link ExchangeService}). 응답에 값이 없으면 empty 가 붙는다.
     */
    public Map<String, Object> exchange(WidgetExtExchangeRequest request) {
        String userId = securityIdentity.currentUserId();
        if (userId == null || userId.isBlank()) {
            throw new BusinessException(ErrorCode.AUTH_FAILED, "인증 정보가 없습니다.");
        }
        WidgetExtExchangeRequest r = request == null ? new WidgetExtExchangeRequest() : request;
        return exchangeService.exchange(r.getBase(), r.getSymbols(), r.getDays(), userId);
    }

    /** {@code { current: {temp, code, wind, humidity}, daily: [{date, min, max, code, pop}] }} (+ stale·disabled). */
    public Map<String, Object> weather(WidgetExtWeatherRequest request) {
        WidgetExtWeatherRequest r = request == null ? new WidgetExtWeatherRequest() : request;
        return weatherService.weather(r.getLat(), r.getLon());
    }

    /**
     * 위젯 편집기 선택지 — {@code { currencies: ["USD", …], places: [{name, lat, lon}] }}.
     * 통화는 환율 마스터(FX_RATE)의 칼럼 라벨, 지점은 날씨 수집 작업(mcm.weather.*)의 이름·좌표다. 어느 쪽이든 못 읽거나 비어 있으면
     * 그 목록만 빈 채로 돌려주고(편집기가 고정 목록으로 대신한다) 다른 쪽 목록과 응답은 막지 않는다.
     */
    public Map<String, Object> options() {
        List<String> currencies = List.of();
        try {
            currencies = fxMasterReader.currencies();
        } catch (RuntimeException e) {
            log.warn("[widgetExt] 환율 통화 선택지를 읽지 못했다: {}", e.getMessage());
        }
        List<Map<String, Object>> places = new ArrayList<>();
        try {
            for (WeatherCollectReader.Place p : weatherCollectReader.places()) {
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("name", p.name());
                m.put("lat", p.lat().doubleValue());
                m.put("lon", p.lon().doubleValue());
                places.add(m);
            }
        } catch (RuntimeException e) {
            log.warn("[widgetExt] 날씨 지점 선택지를 읽지 못했다: {}", e.getMessage());
        }
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("currencies", currencies);
        result.put("places", places);
        return result;
    }
}
