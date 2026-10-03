package com.dongkuk.dmes.mdm.contract.dictionary;

/**
 * 단위 참조 SPI(D-151 검토) — 02 단위 삭제({@code unitMng})가 다른 영역의 표({@code TB_MDM_LAYOUT_ITEM} 등)를 직접 SQL 로 읽지 않고,
 * 그 영역이 이 SPI 를 구현해 단위를 가리키는 행이 있는지 알려준다({@link MdmDomainReferenceSpi} 와 같은 구조, TSK-04-01 D9). 구현체가
 * 없으면 그 영역 참조는 없다. 삭제는 참조가 있으면 FK 위반 대신 도메인 참조와 같은 업무 오류로 거부한다.
 */
public interface MdmUnitReferenceSpi {

    /** 오류 문구에 쓰는 참조 데이터 이름(예: {@code "레이아웃 항목"}). */
    String label();

    /** 이 단위를 가리키는 행이 하나라도 있으면 참. */
    boolean references(String unitCode);
}
