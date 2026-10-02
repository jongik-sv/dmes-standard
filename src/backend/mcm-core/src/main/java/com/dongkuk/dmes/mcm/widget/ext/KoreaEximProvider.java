package com.dongkuk.dmes.mcm.widget.ext;

import com.fasterxml.jackson.databind.JsonNode;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.net.URI;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.util.UriComponentsBuilder;

/**
 * 한국수출입은행 매매기준율(인증키가 있을 때만) — 스펙 §8.1.
 * {@code GET {url}?authkey=KEY&searchdate=yyyyMMdd&data=AP01} → {@code [{"cur_unit":"USD","deal_bas_r":"1,380.5"}, …]}.
 * 날짜마다 하루씩 부르고(토·일은 빈 배열이라 부르지 않는다), 쉼표를 지우고 {@code JPY(100)} 같은 단위는 그 수로 나눈다.
 * 값은 이미 「1 외화 = n KRW」라 KRW 기준만 받는다. 인증키는 로그·예외 메시지에 넣지 않는다.
 */
@Component
public class KoreaEximProvider implements ExchangeRateProvider {

    public static final String ID = "koreaexim";

    private static final DateTimeFormatter YMD = DateTimeFormatter.BASIC_ISO_DATE;
    private static final Pattern CUR_UNIT = Pattern.compile("^([A-Z]{3})(?:\\((\\d+)\\))?$");

    private final WidgetExtProperties properties;
    private final RestClient http;

    @Autowired
    public KoreaEximProvider(WidgetExtProperties properties) {
        this(properties, WidgetExtHttp.builder());
    }

    KoreaEximProvider(WidgetExtProperties properties, RestClient.Builder builder) {
        this.properties = properties;
        this.http = builder.build();
    }

    @Override
    public String id() { return ID; }

    @Override
    public List<ExchangeRatePoint> fetch(String base, List<String> symbols, LocalDate from, LocalDate to) {
        if (!"KRW".equals(base)) {
            throw new WidgetExtException("한국수출입은행 환율은 KRW 기준만 제공합니다.");
        }
        String key = properties.getExchange().getKoreaeximKey();
        if (key == null || key.isBlank()) {
            throw new WidgetExtException("한국수출입은행 인증키가 설정되지 않았습니다.");
        }
        Set<String> wanted = new HashSet<>(symbols);
        List<ExchangeRatePoint> out = new ArrayList<>();
        for (LocalDate d = from; !d.isAfter(to); d = d.plusDays(1)) {
            if (d.getDayOfWeek() == DayOfWeek.SATURDAY || d.getDayOfWeek() == DayOfWeek.SUNDAY) continue;
            URI uri = UriComponentsBuilder.fromUriString(properties.getExchange().getKoreaeximBaseUrl())
                    .queryParam("authkey", key.trim())
                    .queryParam("searchdate", d.format(YMD))
                    .queryParam("data", "AP01")
                    .build().encode().toUri();
            out.addAll(parse(WidgetExtHttp.getJson(http, uri, "환율(한국수출입은행)"), d, wanted));
        }
        return out;
    }

    /** 하루치 배열. result 가 1 이 아닌 항목(인증·호출 한도 오류)이 있으면 예외. 빈 배열은 값 없음(휴일). */
    static List<ExchangeRatePoint> parse(JsonNode array, LocalDate date, Set<String> symbols) {
        if (!array.isArray()) {
            throw new WidgetExtException("환율(한국수출입은행) 응답이 배열이 아닙니다.");
        }
        List<ExchangeRatePoint> out = new ArrayList<>();
        for (JsonNode item : array) {
            if (item.has("result") && item.path("result").asInt() != 1) {
                throw new WidgetExtException("환율(한국수출입은행) 응답 오류: result=" + item.path("result").asInt());
            }
            Matcher m = CUR_UNIT.matcher(item.path("cur_unit").asText("").trim());
            if (!m.matches() || !symbols.contains(m.group(1))) continue;
            String raw = item.path("deal_bas_r").asText("").replace(",", "").trim();
            if (raw.isEmpty()) continue;
            BigDecimal value;
            try {
                value = new BigDecimal(raw);
            } catch (NumberFormatException e) {
                continue;
            }
            if (value.signum() <= 0) continue;
            BigDecimal unit = m.group(2) == null ? BigDecimal.ONE : new BigDecimal(m.group(2));
            if (unit.signum() <= 0) continue;
            out.add(new ExchangeRatePoint(date, m.group(1),
                    value.divide(unit, FrankfurterProvider.SCALE, RoundingMode.HALF_UP)));
        }
        return out;
    }
}
