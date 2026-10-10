package com.dongkuk.dmes.mdm.dma.erdEdit.dto;

import java.util.Map;

/**
 * view kind=STATUS 응답(README S5). statuses 는 컬럼 id → ErdColumnStatus 이름, domains 는 모델에 쓰인 domainId(문자열) → 도메인,
 * counts 는 상태 6개 모두의 수(0 포함), elapsedMs 는 사전 적재 + 판정 시간이다. 읽을 때마다 계산한다(캐시 없음, P3).
 */
public record ErdStatusView(String modelId, String ver, long rev, Map<String, String> statuses,
                            Map<String, Domain> domains, Map<String, Integer> counts, long elapsedMs) {

    public record Domain(String name, String dataType, Integer length, Integer scale) {}
}
