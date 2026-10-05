package com.dongkuk.dmes.mdm.common.rule;

import com.dongkuk.dmes.mdm.common.rule.RuleIo.IoName;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * 하위 세트의 겉모양(하위 세트 spec §2, 계획 편차 10) — 부모가 보는 입력·최종 결과(출력마다 always)·처리 갈래로 끝낼 수 있는가. 서버만 계산하고
 * ({@link RuleSetInterface}, C-D4) 화면은 받아서 검사에 넣는다. 분석기는 이것을 키 {@code set:{setId}} 의 룰 입출력처럼 본다(Ruling 6).
 *
 * @param setName   세트명(화면 SET 노드 제목·속성 패널, Ruling 19). 없는 세트면 null
 * @param exists    기준 시각에 그 세트의 RELEASED 버전이 있는가(Ruling 24). DRAFT 만 있으면 false 다. 기준 시각은 호출자가 정한다
 *                  (화면 조회·DRAFT 저장 경고는 지금, 확정 검사는 apply_from)
 * @param status    세트 상태(INUSE·DEPRECATED). 없는 세트면 null
 * @param inputs    하위 세트 흐름의 입력 변수(예약 이름 {@code CATCH_*} 는 뺀다 — 편차 11)
 * @param outputs   하위 세트의 최종 결과
 * @param endsEarly {@code endedBy} 를 남기는 끝냄이 있는가(편차 10, spec §4.2) — 처리 갈래가 END 로 가거나 처리 갈래 안 IF 갈래가 END 로 간다.
 *                  처리 갈래 밖의 끝내는 IF 갈래는 세지 않는다. 부모의 {@code SUBSET_ENDED} 받는 노드 CATCH_NEVER 판정이 쓴다
 */
public record SetCallIo(String setId, String setName, boolean exists, String status, List<IoName> inputs, List<OutputName> outputs, boolean endsEarly) {

    /** 최종 결과 하나 — always 는 END 에 닿는 모든 경로에서 반드시 만들어지는가(Ruling 16). */
    public record OutputName(String name, String dataType, Integer scale, boolean dateString, String maruCodeId, boolean always) {
    }

    /** 분석기 맵 키 접두. */
    public static final String KEY_PREFIX = "set:";

    /** 분석기용 룰 입출력의 releasedVer 표시 — 분석기는 null 인지만 본다(RELEASED 가 있음 = exists). */
    static final String RELEASED_MARK = "1.000";

    public static SetCallIo missing(String setId) {
        return new SetCallIo(setId, null, false, null, List.of(), List.of(), false);
    }

    /** 분석기 맵 키(룰 ID 와 겹치지 않는다 — 소문자 접두는 ID 정규식에 없다). */
    public static String key(String setId) {
        return KEY_PREFIX + setId;
    }

    public static boolean isKey(String key) {
        return key != null && key.startsWith(KEY_PREFIX);
    }

    /** 키에서 세트 ID. 세트 키가 아니면 그대로(룰 ID). */
    public static String idOf(String key) {
        return isKey(key) ? key.substring(KEY_PREFIX.length()) : key;
    }

    /** 분석기용 룰 입출력 — 입력은 조건, 출력은 결과. 없는 세트면 exists=false(조건·결과 없음). hasDefault 는 false 다. */
    public RuleIo asRuleIo() {
        List<IoName> results = outputs.stream()
                .map(o -> new IoName(o.name(), null, null, o.dataType(), o.scale(), o.dateString(), o.maruCodeId()))
                .toList();
        return new RuleIo(key(setId), null, null, status, exists, exists ? RELEASED_MARK : null, null, inputs, results);
    }

    /** 연쇄 재검사 판단(하위 세트 spec §6.1-2) — 입력의 이름·타입, 출력의 이름·타입·always 가 집합으로 같은가. 세트명·상태·출처·표시명·소수 자리·endsEarly 는 보지 않는다. */
    public boolean sameShape(SetCallIo other) {
        return shapeOf(this).equals(shapeOf(other));
    }

    private static Set<List<Object>> shapeOf(SetCallIo io) {
        Set<List<Object>> out = new HashSet<>();
        io.inputs().forEach(i -> out.add(Arrays.asList("in", i.name(), i.dataType())));
        io.outputs().forEach(o -> out.add(Arrays.asList("out", o.name(), o.dataType(), o.always())));
        return out;
    }
}
