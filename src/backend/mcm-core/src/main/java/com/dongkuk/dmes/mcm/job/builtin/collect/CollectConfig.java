package com.dongkuk.dmes.mcm.job.builtin.collect;

import java.net.URI;
import java.util.List;

/**
 * COLLECT 작업의 CONFIG_JSON — {@code {source:{…}, save:true}}(설계 §5.1). 원천 3종: sql·http·exchange. {@code save=false} 면 읽기만 한다(외부 트리거용).
 * 파싱·검사는 {@link CollectConfigs#parse}.
 */
public record CollectConfig(Source source, boolean save) {

    public sealed interface Source permits SqlSource, HttpSource, ExchangeSource {}

    /** SQL 원천 — keyField 가 없으면 첫 행의 valueField 값 하나(키 VALUE). */
    public record SqlSource(String sql, String valueField, String keyField) implements Source {}

    /** HTTP JSON 원천 — items 마다 응답 JSON 안 위치(path)의 값을 항목 key 로 저장. */
    public record HttpSource(URI url, List<HttpItem> items) implements Source {}

    /** path 는 {@code data.items[0].price} 를 풀어 낸 조각(글자=키, 정수=배열 첨자), pathText 는 원문. */
    public record HttpItem(String key, String pathText, List<Object> path) {}

    /** 환율 원천 — 기준 통화 KRW 에 대한 각 통화의 오늘 값. MCM 모듈 작업에서만 쓴다(계획 D7). */
    public record ExchangeSource(List<String> currencies) implements Source {}
}
