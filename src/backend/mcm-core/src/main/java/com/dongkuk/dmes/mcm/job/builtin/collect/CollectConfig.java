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

    /**
     * HTTP JSON 원천 — items 마다 응답 JSON 안 위치(path)의 값을 항목 key 로 저장.
     * template 은 주소 원문이고 {@code {{이름}}} 자리를 가질 수 있다(경로·쿼리에만, {@link HttpUrlTemplate}). url 은 그 자리를 자리표시 글자로 바꿔 읽은 주소라
     * 스킴·호스트 검사에만 쓰고 실제 호출 주소는 {@link HttpUrlTemplate#render} 가 만든다.
     */
    public record HttpSource(URI url, List<HttpItem> items, String template) implements Source {

        /** 변수 자리가 없는 주소. */
        public HttpSource(URI url, List<HttpItem> items) {
            this(url, items, url.toString());
        }
    }

    /** path 는 {@code data.items[0].price} 를 풀어 낸 조각(글자=키, 정수=배열 첨자), pathText 는 원문. */
    public record HttpItem(String key, String pathText, List<Object> path) {}

    /** 환율 원천 — 기준 통화 KRW 에 대한 각 통화의 오늘 값. MCM 모듈 작업에서만 쓴다(계획 D7). */
    public record ExchangeSource(List<String> currencies) implements Source {}
}
