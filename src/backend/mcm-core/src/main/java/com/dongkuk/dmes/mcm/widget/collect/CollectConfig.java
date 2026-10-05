package com.dongkuk.dmes.mcm.widget.collect;

import java.net.URI;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.List;

/**
 * 정시 수집 정의(CONFIG_JSON, TYPE_ID=collect) — 스펙 2026-10-05 정시 수집 §2. 파싱·검사는 {@link CollectConfigs#parse}.
 *
 * @param schedule 수집 시각 규칙
 * @param source   원천(sql·http·exchange)
 * @param showDays 위젯이 읽을 기간(일, 1~90)
 * @param showUnit 값 단위 글자(0~10자, 없으면 빈 글자)
 */
public record CollectConfig(Schedule schedule, Source source, int showDays, String showUnit) {

    public static final String TYPE_ID = "collect";

    public enum Mode { INTERVAL, DAILY }

    /**
     * 수집 시각 규칙. interval 은 자정부터 지난 분이 everyMin 의 배수일 때, daily 는 이번 분 HH:mm 이 at 에 있을 때 수집 시각이다(Asia/Seoul).
     */
    public record Schedule(Mode mode, int everyMin, List<LocalTime> at) {

        /** minute(서울 시각, 초 이하는 무시)가 수집 시각인가. */
        public boolean isDue(LocalDateTime minute) {
            if (mode == Mode.INTERVAL) {
                return (minute.getHour() * 60 + minute.getMinute()) % everyMin == 0;
            }
            return at.contains(LocalTime.of(minute.getHour(), minute.getMinute()));
        }
    }

    public sealed interface Source permits SqlSource, HttpSource, ExchangeSource {}

    /** SQL 원천 — keyField 가 없으면 첫 행의 valueField 값 하나(키 VALUE). */
    public record SqlSource(String sql, String valueField, String keyField) implements Source {}

    /** HTTP JSON 원천 — items 마다 응답 JSON 안 위치(path)의 값을 항목 key 로 저장. */
    public record HttpSource(URI url, List<HttpItem> items) implements Source {}

    /** path 는 {@code data.items[0].price} 를 풀어 낸 조각(글자=키, 정수=배열 첨자), pathText 는 원문. */
    public record HttpItem(String key, String pathText, List<Object> path) {}

    /** 환율 원천 — 기준 통화 KRW 에 대한 각 통화의 오늘 값. */
    public record ExchangeSource(List<String> currencies) implements Source {}
}
