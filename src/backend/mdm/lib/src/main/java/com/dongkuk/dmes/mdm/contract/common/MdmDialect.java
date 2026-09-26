package com.dongkuk.dmes.mdm.contract.common;

/**
 * mdm 이 지원하는 DB 방언 — 규칙표 §4. 지금은 로컬·테스트의 SQLite 하나다.
 *
 * <p>운영 DB 는 미정이다(ADR-0004). 방언 판정·방언별 문안의 자리(이 enum 과 {@link MdmDialectResolver})는 운영 DB 가
 * 정해지면 값을 더하도록 남겨 둔다. 방언 분기는 {@code switch} 로 써서 값을 더하면 컴파일러가 빠진 분기를 알려 준다.
 */
public enum MdmDialect {
    SQLITE
}
