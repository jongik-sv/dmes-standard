package com.dongkuk.dmes.mdm.contract.category;

/**
 * 마루 ID 이름 공간 SPI — 04(TB_MDM_CODE)·05(TB_MDM_DATA)가 구현한다. 마루 코드 ID 와 마루 데이터 ID 는 한 이름
 * 공간이라, 등록 서비스는 {@code List<MaruIdNamespace>} 로 상대 표에 같은 ID 가 있는지 본다(04:74, 05:86·353).
 */
public interface MaruIdNamespace {

    MaruIdKind kind();

    boolean contains(String maruId);
}
