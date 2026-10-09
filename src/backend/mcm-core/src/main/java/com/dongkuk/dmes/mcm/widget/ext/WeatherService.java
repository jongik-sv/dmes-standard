package com.dongkuk.dmes.mcm.widget.ext;

import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import com.dongkuk.dmes.mcm.common.exception.ErrorCode;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Clock;
import java.time.Duration;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

/**
 * 날씨 조회 — 외부 제공자를 직접 부르지 않고, 예약 작업의 수집(jobCollect)이 모아 둔 최신 회차를 읽는다
 * (설계 docs/superpowers/specs/2026-10-09-weather-collect-design.md). 좌표는 소수 둘째 자리로 반올림해
 * 작업 변수 {@code lat}·{@code lon} 이 같은 {@code mcm.weather.*} 수집 작업을 찾는다({@link WeatherCollectReader}).
 * <ul>
 *   <li>응답 {@code collectedAt}(yyyy-MM-dd'T'HH:mm, 서울 시각) = 그 회차의 수집 시각. {@value #STALE_AFTER_MIN}분보다 오래됐으면 {@code stale: true}.</li>
 *   <li>수집 대상이 아닌 좌표 → {@code {current: null, daily: [], uncollected: true}}.</li>
 *   <li>수집된 값이 아직 없음 → {@code {current: null, daily: [], empty: true}}.</li>
 * </ul>
 */
@Service("widgetWeatherService")
public class WeatherService {

    /** 수집 주기(30분)의 3배 — 이보다 오래된 값은 「새로 받지 못한 저장 값」으로 표시한다. */
    static final int STALE_AFTER_MIN = 90;

    private static final Duration STALE_AFTER = Duration.ofMinutes(STALE_AFTER_MIN);
    private static final BigDecimal LAT_MAX = BigDecimal.valueOf(90);
    private static final BigDecimal LON_MAX = BigDecimal.valueOf(180);
    private static final DateTimeFormatter COLLECTED_AT = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm");

    private final WeatherCollectReader reader;
    private final Clock clock;

    @Autowired
    public WeatherService(WeatherCollectReader reader) {
        this(reader, Clock.system(ExchangeService.ZONE));
    }

    WeatherService(WeatherCollectReader reader, Clock clock) {
        this.reader = reader;
        this.clock = clock;
    }

    /** {@code { current: {temp, code, wind, humidity}, daily: [{date, min, max, code, pop}], collectedAt }} (+ stale·uncollected·empty). */
    public Map<String, Object> weather(BigDecimal lat, BigDecimal lon) {
        if (lat == null || lon == null) {
            throw new BusinessException(ErrorCode.REQUIRED_VALUE, "위도·경도를 입력하세요.");
        }
        if (lat.abs().compareTo(LAT_MAX) > 0 || lon.abs().compareTo(LON_MAX) > 0) {
            throw new BusinessException(ErrorCode.INVALID_VALUE, "위도는 -90~90, 경도는 -180~180 사이여야 합니다.");
        }
        WeatherCollectReader.Result result = reader.read(lat.setScale(2, RoundingMode.HALF_UP), lon.setScale(2, RoundingMode.HALF_UP));
        if (result.status() != WeatherCollectReader.Status.OK) {
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("current", null);
            out.put("daily", new ArrayList<>());
            out.put(result.status() == WeatherCollectReader.Status.UNCOLLECTED ? "uncollected" : "empty", true);
            return out;
        }
        Map<String, Object> out = result.report().toMap();
        LocalDateTime collectedAt = result.collectedAt();
        out.put("collectedAt", COLLECTED_AT.format(collectedAt));
        if (LocalDateTime.now(clock).isAfter(collectedAt.plus(STALE_AFTER))) out.put("stale", true);
        return out;
    }
}
