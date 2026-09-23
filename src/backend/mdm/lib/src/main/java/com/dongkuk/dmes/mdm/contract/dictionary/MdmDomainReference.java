package com.dongkuk.dmes.mdm.contract.dictionary;

/**
 * 외부 참조 한 건(TSK-04-01 design.md §7.3, D9) — {@code refKind} 예: {@code "RULE_VAR"}(06 이 구현),
 * {@code "LAYOUT_ITEM"}(03 이 구현). {@code refKey} 는 그 소비자 쪽 식별자를 문자열로 담는다 — 02 계약이
 * 03·06 의 PK 타입을 알 필요가 없게 한다.
 */
public record MdmDomainReference(String refKind, String refKey) {
}
