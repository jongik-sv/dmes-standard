package com.dongkuk.dmes.mcm.widget.ext;

import com.dongkuk.dmes.mcm.widget.ext.dto.WidgetExtExchangeRequest;
import com.dongkuk.dmes.mcm.widget.ext.dto.WidgetExtWeatherRequest;
import java.util.Map;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

/**
 * 환율·날씨 위젯 — OASIS {@code widgetExt}(스펙 2026-10-02-widget-admin-generic §5.1, AUTH_ONLY).
 * 사용자 데이터가 없는 공용 정보라 사용자 ID 를 쓰지 않는다. {@code @Transactional} 을 붙이지 않는다(쓰기는
 * {@link ExchangeRateWriter}).
 */
@Service("widgetExtService")
public class WidgetExtService {

    private final ExchangeService exchangeService;
    private final WeatherService weatherService;

    @Autowired
    public WidgetExtService(ExchangeService exchangeService, WeatherService weatherService) {
        this.exchangeService = exchangeService;
        this.weatherService = weatherService;
    }

    /** {@code { latest: [{cur, rate, diff, date}], history: [{date, cur, rate}] }} (+ stale·disabled). */
    public Map<String, Object> exchange(WidgetExtExchangeRequest request) {
        WidgetExtExchangeRequest r = request == null ? new WidgetExtExchangeRequest() : request;
        return exchangeService.exchange(r.getBase(), r.getSymbols(), r.getDays());
    }

    /** {@code { current: {temp, code, wind, humidity}, daily: [{date, min, max, code, pop}] }} (+ stale·disabled). */
    public Map<String, Object> weather(WidgetExtWeatherRequest request) {
        WidgetExtWeatherRequest r = request == null ? new WidgetExtWeatherRequest() : request;
        return weatherService.weather(r.getLat(), r.getLon());
    }
}
