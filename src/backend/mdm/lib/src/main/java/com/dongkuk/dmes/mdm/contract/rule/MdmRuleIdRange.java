package com.dongkuk.dmes.mdm.contract.rule;

/** 한 번에 발급한 연속 구간 [first, last](TSK-08-01 design.md D8). count 가 1 이면 {@code first == last}. */
public record MdmRuleIdRange(String maruRuleId, MdmRuleIdKind kind, int first, int last) {
}
