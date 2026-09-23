package com.dongkuk.dmes.mdm.contract.dictionary;

/**
 * 도메인 종류(TSK-04-01 design.md §7.1). 값 집합은 엔진(현재 문서 초안뿐, F15)의 {@code DomainKind} 와
 * 같게 의도하되 별도 타입으로 선언한다(불변 규칙 6) — 엔진 모듈과의 컴파일 결합을 만들지 않기 위해서다.
 */
public enum MdmDomainKind {
    QTY, CODE, ID, TEXT, DATE, FLAG
}
