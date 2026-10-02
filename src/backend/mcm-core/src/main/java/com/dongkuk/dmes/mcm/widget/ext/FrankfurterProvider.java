package com.dongkuk.dmes.mcm.widget.ext;

import com.fasterxml.jackson.databind.JsonNode;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.net.URI;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.HashSet;
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
 *   <li>구간 {@code GET {base-url}/{from}..{to}?base=KRW&symbols=USD,EUR} → {@code {"rates":{"2026-09-30":{"USD":0.000724}}}}</li>
 *   <li>하루 {@code GET {base-url}/{date}?base=KRW&symbols=…} → {@code {"date":"…","rates":{"USD":0.000724}}}
 *       (그날 값이 없으면 직전 영업일 값과 그 날짜가 온다 — 응답 날짜로 적는다)</li>
 * </ul>
 * base=KRW 응답은 「1 KRW = n 외화」라 역수로 바꿔 「1 외화 = n KRW」, 소수 8자리 HALF_UP 으로 돌려준다.
 */
@Component
public class FrankfurterProvider implements ExchangeRateProvider {

    public static final String ID = "frankfurter";
    static final int SCALE = 8;

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
        String baseUrl = properties.getExchange().getFrankfurterBaseUrl();
        while (baseUrl.endsWith("/")) baseUrl = baseUrl.substring(0, baseUrl.length() - 1);
        String path = from.equals(to) ? from.toString() : from + ".." + to;
        URI uri = UriComponentsBuilder.fromUriString(baseUrl + "/" + path)
                .queryParam("base", base)
                .queryParam("symbols", String.join(",", symbols))
                .build().encode().toUri();
        return parse(WidgetExtHttp.getJson(http, uri, "환율(Frankfurter)"), new HashSet<>(symbols));
    }

    /** 구간·하루 두 모양을 모두 읽는다. 묻지 않은 통화·0 이하 값은 버린다. */
    static List<ExchangeRatePoint> parse(JsonNode root, Set<String> symbols) {
        JsonNode rates = root.path("rates");
        if (!rates.isObject()) {
            throw new WidgetExtException("환율(Frankfurter) 응답에 rates 가 없습니다.");
        }
        List<ExchangeRatePoint> out = new ArrayList<>();
        LocalDate singleDate = root.hasNonNull("date") ? date(root.get("date").asText()) : null;
        for (Map.Entry<String, JsonNode> e : rates.properties()) {
            if (e.getValue().isObject()) { // 구간: 날짜 → {통화: 값}
                LocalDate date = date(e.getKey());
                for (Map.Entry<String, JsonNode> c : e.getValue().properties()) {
                    add(out, symbols, date, c.getKey(), c.getValue());
                }
            } else if (singleDate != null) { // 하루: 통화 → 값
                add(out, symbols, singleDate, e.getKey(), e.getValue());
            }
        }
        return out;
    }

    private static void add(List<ExchangeRatePoint> out, Set<String> symbols, LocalDate date, String cur, JsonNode value) {
        if (!symbols.contains(cur) || !value.isNumber()) return;
        BigDecimal perKrw = value.decimalValue();
        if (perKrw.signum() <= 0) return;
        out.add(new ExchangeRatePoint(date, cur, BigDecimal.ONE.divide(perKrw, SCALE, RoundingMode.HALF_UP)));
    }

    private static LocalDate date(String text) {
        try {
            return LocalDate.parse(text);
        } catch (DateTimeParseException e) {
            throw new WidgetExtException("환율(Frankfurter) 응답 날짜 형식이 올바르지 않습니다.");
        }
    }
}
