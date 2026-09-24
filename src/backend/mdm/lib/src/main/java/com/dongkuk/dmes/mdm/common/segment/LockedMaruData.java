package com.dongkuk.dmes.mdm.common.segment;

import java.util.List;

/**
 * 잠금 뒤 네이티브로 다시 읽은 {@code TB_MDM_DATA} 행(L1). 검사 1·2·3·5·5-2 가 이 값으로 판정한다(C1: 잠금 전 값을 쓰지
 * 않는다). {@code attrNames} 는 번호 순 10개이고 라벨이 없는 번호는 null 이다.
 */
public record LockedMaruData(String maruDataId, String status, String sourceKind, String sourceSystem,
                             String codePattern, int lvlCnt, List<String> attrNames) {

    public static final String INUSE = "INUSE";
    public static final String DEPRECATED = "DEPRECATED";
    public static final String MDM = "MDM";
    public static final String EXTERNAL = "EXTERNAL";

    /** 1부터 10까지의 번호로 라벨을 읽는다. */
    public String attrName(int no) {
        return attrNames.get(no - 1);
    }
}
