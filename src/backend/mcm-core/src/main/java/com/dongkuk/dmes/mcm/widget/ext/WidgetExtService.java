package com.dongkuk.dmes.mcm.widget.ext;

import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import com.dongkuk.dmes.mcm.common.exception.ErrorCode;
import com.dongkuk.dmes.mcm.common.security.SecurityIdentity;
import com.dongkuk.dmes.mcm.widget.ext.dto.WidgetExtExchangeRequest;
import com.dongkuk.dmes.mcm.widget.ext.dto.WidgetExtWeatherRequest;
import java.util.Map;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

/**
 * 환율·날씨 위젯 — OASIS {@code widgetExt}(스펙 2026-10-02-widget-admin-generic §5.1, AUTH_ONLY).
 * 사용자 데이터가 없는 공용 정보다. 환율은 MDM 환율 마스터를 읽기만 하며(쓰기 없음), 인증 사용자 ID 는 인증 컨텍스트에서 얻는다.
 * {@code @Transactional} 을 붙이지 않는다.
 */
@Service("widgetExtService")
public class WidgetExtService {

    private final ExchangeService exchangeService;
    private final WeatherService weatherService;
    private final SecurityIdentity securityIdentity;

    @Autowired
    public WidgetExtService(ExchangeService exchangeService, WeatherService weatherService, SecurityIdentity securityIdentity) {
        this.exchangeService = exchangeService;
        this.weatherService = weatherService;
        this.securityIdentity = securityIdentity;
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
}
