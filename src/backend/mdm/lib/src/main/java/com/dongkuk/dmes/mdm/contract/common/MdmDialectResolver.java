package com.dongkuk.dmes.mdm.contract.common;

/**
 * 방언 판정 빈 계약 — 규칙표 §4 "방언 판정은 한 곳"(TSK-02-01 인계).
 * 구현(빈)은 첫 소비자 TSK-01-03 이 이 패키지 밖에 둔다(design.md D3).
 */
public interface MdmDialectResolver {

    MdmDialect current();
}
