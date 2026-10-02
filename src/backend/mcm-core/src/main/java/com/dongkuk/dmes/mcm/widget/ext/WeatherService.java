package com.dongkuk.dmes.mcm.widget.ext;

import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import com.dongkuk.dmes.mcm.common.exception.ErrorCode;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

/**
 * 날씨 조회 — 스펙 §8.2. 좌표를 소수 둘째 자리로 반올림한 칸별로 10분 캐시한다(제공자에도 반올림 좌표로 묻는다).
 * <ul>
 *   <li>실패 → 캐시에 이전 값이 있으면 그것 + {@code stale: true}, 없으면 「날씨 정보를 불러오지 못했습니다」.</li>
 *   <li>{@code dmes.widget.ext.enabled=false} → 외부 호출 없이 캐시 값만(10분 지났으면 stale), 없으면
 *       {@code {current: null, daily: [], disabled: true}}.</li>
 * </ul>
 * 캐시는 칸 {@value #MAX_ENTRIES}개까지(가장 오래 안 쓴 칸부터 버린다) — 아무 좌표나 넣어 메모리를 채우지 못하게.
 */
@Service("widgetWeatherService")
public class WeatherService {

    static final Duration TTL = Duration.ofMinutes(10);
    static final int MAX_ENTRIES = 1000;
    static final String FAIL_MESSAGE = "날씨 정보를 불러오지 못했습니다";

    private static final Logger log = LoggerFactory.getLogger(WeatherService.class);
    private static final BigDecimal LAT_MAX = BigDecimal.valueOf(90);
    private static final BigDecimal LON_MAX = BigDecimal.valueOf(180);

    private record Entry(WeatherReport report, Instant fetchedAt) {}

    private final WidgetExtProperties properties;
    private final WeatherProvider provider;
    private final Clock clock;
    private final Map<String, Entry> cache = new LinkedHashMap<>(64, 0.75f, true) {
        @Override
        protected boolean removeEldestEntry(Map.Entry<String, Entry> eldest) {
            return size() > MAX_ENTRIES;
        }
    };

    @Autowired
    public WeatherService(WidgetExtProperties properties, OpenMeteoProvider provider) {
        this(properties, (WeatherProvider) provider, Clock.system(ExchangeService.ZONE));
    }

    WeatherService(WidgetExtProperties properties, WeatherProvider provider, Clock clock) {
        this.properties = properties;
        this.provider = provider;
        this.clock = clock;
    }

    /** {@code { current: {temp, code, wind, humidity}, daily: [{date, min, max, code, pop}] }} (+ stale·disabled). */
    public Map<String, Object> weather(BigDecimal lat, BigDecimal lon) {
        if (lat == null || lon == null) {
            throw new BusinessException(ErrorCode.REQUIRED_VALUE, "위도·경도를 입력하세요.");
        }
        if (lat.abs().compareTo(LAT_MAX) > 0 || lon.abs().compareTo(LON_MAX) > 0) {
            throw new BusinessException(ErrorCode.INVALID_VALUE, "위도는 -90~90, 경도는 -180~180 사이여야 합니다.");
        }
        BigDecimal rLat = lat.setScale(2, RoundingMode.HALF_UP);
        BigDecimal rLon = lon.setScale(2, RoundingMode.HALF_UP);
        String key = rLat.toPlainString() + "," + rLon.toPlainString();
        Instant now = clock.instant();

        Entry cached = get(key);
        boolean fresh = cached != null && now.isBefore(cached.fetchedAt().plus(TTL));
        if (fresh) {
            return cached.report().toMap();
        }
        if (!properties.isEnabled()) {
            if (cached != null) return stale(cached);
            Map<String, Object> empty = new LinkedHashMap<>();
            empty.put("current", null);
            empty.put("daily", new ArrayList<>());
            empty.put("disabled", true);
            return empty;
        }
        try {
            WeatherReport report = provider.fetch(rLat, rLon);
            put(key, new Entry(report, now));
            return report.toMap();
        } catch (RuntimeException e) {
            log.warn("[widgetExt] 날씨 제공자 호출 실패({}): {}", key, e.getMessage());
            if (cached != null) return stale(cached);
            throw new BusinessException(ErrorCode.BUSINESS_ERROR, FAIL_MESSAGE);
        }
    }

    private static Map<String, Object> stale(Entry cached) {
        Map<String, Object> out = cached.report().toMap();
        out.put("stale", true);
        return out;
    }

    private Entry get(String key) {
        synchronized (cache) {
            return cache.get(key);
        }
    }

    private void put(String key, Entry entry) {
        synchronized (cache) {
            cache.put(key, entry);
        }
    }
}
