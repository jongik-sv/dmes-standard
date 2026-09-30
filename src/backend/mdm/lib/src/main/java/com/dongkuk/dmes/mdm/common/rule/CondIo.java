package com.dongkuk.dmes.mdm.common.rule;

import com.dongkuk.dmes.mdm.common.rule.RuleIo.IoName;
import java.util.List;

/**
 * IF 갈래 조건식 하나의 입력(계획 C4) — 서버가 식을 미리 풀어 분석기·화면에 넘긴다. {@code ok=false} 면 {@code message} 가 파싱 오류 문구이고
 * {@code vars} 는 비어 있다. 변수의 {@code source} 는 {@code DICT}(컬럼 사전에 있음) 또는 {@code NONE} 이다.
 */
public record CondIo(boolean ok, String message, List<IoName> vars) {
}
