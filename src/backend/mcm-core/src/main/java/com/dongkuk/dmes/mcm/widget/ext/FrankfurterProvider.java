package com.dongkuk.dmes.mcm.widget.ext;

import com.fasterxml.jackson.databind.JsonNode;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.net.URI;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.util.UriComponentsBuilder;

/**
 * Frankfurter(유럽중앙은행 기준, 키 없음, 영업일만) — 스펙 §8.1.
 * <ul>
 *   <li>구간 {@code GET {base-url}/{from}..{to}?symbols=KRW,USD,JPY}
 *       → {@code {"base":"EUR","rates":{"2026-10-01":{"KRW":1537.96,"USD":1.1298}}}}</li>
 *   <li>하루 {@code GET {base-url}/{date}?symbols=KRW,…} → {@code {"base":"EUR","date":"…","rates":{"KRW":1537.96,…}}}
 *       (그날 값이 없으면 직전 영업일 값과 그 날짜가 온다 — 응답 날짜로 적는다)</li>
 * </ul>
 * base 를 주지 않아 ECB 기준(EUR)으로 받고, 날짜마다 「1 X = KRW ÷ X」 를 소수 8자리 HALF_UP 으로 교차 계산한다
 * (EUR 은 KRW 값 그대로). {@code base=KRW} 로 물으면 값이 소수 5자리(유효숫자 2~3개)로 잘려 역수가 최대 0.6% 어긋나고
 * 하루 변동이 계단식으로만 보여서 쓰지 않는다. EUR 은 기준 통화라 symbols 에 넣지 않는다(넣어도 응답에서 빠진다).
 */
@Component
public class FrankfurterProvider implements ExchangeRateProvider {

    public static final String ID = "frankfurter";
    static final int SCALE = 8;
    static final String KRW = "KRW";
    /** base 를 생략했을 때 Frankfurter 가 쓰는 기준 통화(ECB). */
    static final String ECB_BASE = "EUR";

    private final WidgetExtProperties properties;
    private final RestClient http;

    @Autowired
    public FrankfurterProvider(WidgetExtProperties properties) {
        this(properties, WidgetExtHttp.builder());
    }

    FrankfurterProvider(WidgetExtProperties properties, RestClient.Builder builder) {
        this.properties = properties;
        this.http = builder.build();
    }

    @Override
    public String id() { return ID; }

    @Override
    public List<ExchangeRatePoint> fetch(String base, List<String> symbols, LocalDate from, LocalDate to) {
        if (!KRW.equals(base)) {
            throw new WidgetExtException("환율(Frankfurter)은 KRW 기준만 제공합니다.");
        }
        String baseUrl = properties.getExchange().getFrankfurterBaseUrl();
        while (baseUrl.endsWith("/")) baseUrl = baseUrl.substring(0, baseUrl.length() - 1);
        String path = from.equals(to) ? from.toString() : from + ".." + to;
        Set<String> query = new LinkedHashSet<>();
        query.add(KRW); // 교차 계산의 분자 — 늘 먼저
        for (String s : symbols) {
            if (!ECB_BASE.equals(s)) query.add(s);
        }
        URI uri = UriComponentsBuilder.fromUriString(baseUrl + "/" + path)
                .queryParam("symbols", String.join(",", query))
                .build().encode().toUri();
        return parse(WidgetExtHttp.getJson(http, uri, "환율(Frankfurter)"), new LinkedHashSet<>(symbols));
    }

    /** 구간·하루 두 모양을 모두 읽는다. 묻지 않은 통화·0 이하 값은 버리고, 날짜에 KRW 가 없으면 예외. */
    static List<ExchangeRatePoint> parse(JsonNode root, Set<String> symbols) {
        JsonNode rates = root.path("rates");
        if (!rates.isObject()) {
            throw new WidgetExtException("환율(Frankfurter) 응답에 rates 가 없습니다.");
        }
        String ref = root.path("base").asText(ECB_BASE);
        if (ref.isBlank()) ref = ECB_BASE;
        List<ExchangeRatePoint> out = new ArrayList<>();
        if (root.hasNonNull("date")) { // 하루: 통화 → 값
            addDay(out, symbols, ref, date(root.get("date").asText()), rates);
        } else { // 구간: 날짜 → {통화: 값}
            for (Map.Entry<String, JsonNode> e : rates.properties()) {
                if (e.getValue().isObject()) {
                    addDay(out, symbols, ref, date(e.getKey()), e.getValue());
                }
            }
        }
        return out;
    }

    /** 하루치 {통화: 1 ref 의 값} → 「1 X = n KRW」. ref 통화 자신은 1. */
    private static void addDay(List<ExchangeRatePoint> out, Set<String> symbols, String ref, LocalDate date,
                               JsonNode day) {
        BigDecimal krwPerRef = ref.equals(KRW) ? BigDecimal.ONE : number(day.get(KRW));
        if (krwPerRef == null) {
            throw new WidgetExtException("환율(Frankfurter) 응답에 " + date + " KRW 값이 없습니다.");
        }
        if (krwPerRef.signum() <= 0) return;
        for (String cur : symbols) {
            BigDecimal curPerRef = cur.equals(ref) ? BigDecimal.ONE : number(day.get(cur));
            if (curPerRef == null || curPerRef.signum() <= 0) continue;
            out.add(new ExchangeRatePoint(date, cur, krwPerRef.divide(curPerRef, SCALE, RoundingMode.HALF_UP)));
        }
    }

    private static BigDecimal number(JsonNode value) {
        return value != null && value.isNumber() ? value.decimalValue() : null;
    }

    private static LocalDate date(String text) {
        try {
            return LocalDate.parse(text);
        } catch (DateTimeParseException e) {
            throw new WidgetExtException("환율(Frankfurter) 응답 날짜 형식이 올바르지 않습니다.");
        }
    }
}
