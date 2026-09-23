package com.dongkuk.dmes.mdm.contract.screen;

/**
 * mdm 화면 그룹 5종 — screens/README §2, ADR-0003 D1. 코드는 FE 경로 {@code m-mdm/pages/{group}/{screenId}}
 * 와 메뉴 폴더 ID 로 쓰고, 폴더 이름은 사이드바에 보이는 이름이다. 결재 그룹(dmf)은 보류라 두지 않는다.
 */
public enum MdmScreenGroup {

    DMA("dma", "용어·도메인"),
    DMB("dmb", "레이아웃"),
    DMC("dmc", "마스터코드"),
    DMD("dmd", "마스터데이터"),
    DME("dme", "업무기준");

    private final String code;
    private final String menuFolderName;

    MdmScreenGroup(String code, String menuFolderName) {
        this.code = code;
        this.menuFolderName = menuFolderName;
    }

    public String code() {
        return code;
    }

    public String menuFolderName() {
        return menuFolderName;
    }
}
