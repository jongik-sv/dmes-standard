package com.dongkuk.dmes.mdm.contract.dictionary;

/**
 * 도메인 저장 데이터 타입(TSK-04-01 design.md §7.1). 값 집합은 엔진(현재 문서 초안뿐, F15)의
 * {@code DataType} 과 같게 의도하되 별도 타입으로 선언한다(불변 규칙 6).
 */
public enum MdmDataType {
    NUMBER, STRING, BOOLEAN, DATE
}
