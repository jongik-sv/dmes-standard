package com.dongkuk.dmes.mdm.dmd.dataItemMng.dto;

/** {@code dataItemMng} action={@code reg}·{@code save} 요청. OASIS params 는 배열·null 을 받지 못해(F14) 계층·추가 컬럼을 따로 된 필드로 받는다. 빠진 필드는 null 이다(05 페이로드 "빠진 번호는 NULL"). */
public class DataItemSaveRequest {

    private String maruDataId;
    private String code;
    private String name;
    private String alterName;
    private Integer seq;
    private String description;
    private String lvl1;
    private String lvl2;
    private String lvl3;
    private String lvl4;
    private String lvl5;
    private String attr01;
    private String attr02;
    private String attr03;
    private String attr04;
    private String attr05;
    private String attr06;
    private String attr07;
    private String attr08;
    private String attr09;
    private String attr10;
    /** 수정 때 화면이 본 row_version. 등록은 무시한다. */
    private Integer expectedRowVersion;

    public String getMaruDataId() { return maruDataId; }
    public String getCode() { return code; }
    public String getName() { return name; }
    public String getAlterName() { return alterName; }
    public Integer getSeq() { return seq; }
    public String getDescription() { return description; }
    public String getLvl1() { return lvl1; }
    public String getLvl2() { return lvl2; }
    public String getLvl3() { return lvl3; }
    public String getLvl4() { return lvl4; }
    public String getLvl5() { return lvl5; }
    public String getAttr01() { return attr01; }
    public String getAttr02() { return attr02; }
    public String getAttr03() { return attr03; }
    public String getAttr04() { return attr04; }
    public String getAttr05() { return attr05; }
    public String getAttr06() { return attr06; }
    public String getAttr07() { return attr07; }
    public String getAttr08() { return attr08; }
    public String getAttr09() { return attr09; }
    public String getAttr10() { return attr10; }
    public Integer getExpectedRowVersion() { return expectedRowVersion; }

    public void setMaruDataId(String v) { this.maruDataId = v; }
    public void setCode(String v) { this.code = v; }
    public void setName(String v) { this.name = v; }
    public void setAlterName(String v) { this.alterName = v; }
    public void setSeq(Integer v) { this.seq = v; }
    public void setDescription(String v) { this.description = v; }
    public void setLvl1(String v) { this.lvl1 = v; }
    public void setLvl2(String v) { this.lvl2 = v; }
    public void setLvl3(String v) { this.lvl3 = v; }
    public void setLvl4(String v) { this.lvl4 = v; }
    public void setLvl5(String v) { this.lvl5 = v; }
    public void setAttr01(String v) { this.attr01 = v; }
    public void setAttr02(String v) { this.attr02 = v; }
    public void setAttr03(String v) { this.attr03 = v; }
    public void setAttr04(String v) { this.attr04 = v; }
    public void setAttr05(String v) { this.attr05 = v; }
    public void setAttr06(String v) { this.attr06 = v; }
    public void setAttr07(String v) { this.attr07 = v; }
    public void setAttr08(String v) { this.attr08 = v; }
    public void setAttr09(String v) { this.attr09 = v; }
    public void setAttr10(String v) { this.attr10 = v; }
    public void setExpectedRowVersion(Integer v) { this.expectedRowVersion = v; }
}
