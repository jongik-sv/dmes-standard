package com.dongkuk.dmes.mdm.dmc.codeEdit.dto;

/** 버튼 매트릭스 판정용 서버 값(TSK-06-02 design.md §6.8·§6.12). */
public class CodeEditFlags {

    private int unappliedCount;
    private boolean canNewMajor;
    private boolean canNewMinor;
    private String nextMajor;
    private String nextMinor;
    /** 가장 큰 번호의 소수부가 999 라 minor 를 만들 수 없다(major 를 올리십시오). */
    private boolean minorLimit;
    private boolean canDeprecate;
    /** 원천 MDM 이고 요청 사용자가 담당자. */
    private boolean editable;
    /** 한 번도 RELEASED 된 적 없다 — TB_MDM_CODE_VER 에 RELEASED·CANCELLED 행이 없다(VER 0개 포함). 화면은 [폐기] 자리에 [삭제] 를 그린다. */
    private boolean neverReleased;
    /** neverReleased 이고 editable 이고 다른 사용자가 소유한 DRAFT 가 없다. 참조(도메인·식·수신 로그) 거부는 실행 때 서버가 다시 본다. */
    private boolean canDeleteCode;

    public int getUnappliedCount() { return unappliedCount; }
    public boolean isCanNewMajor() { return canNewMajor; }
    public boolean isCanNewMinor() { return canNewMinor; }
    public String getNextMajor() { return nextMajor; }
    public String getNextMinor() { return nextMinor; }
    public boolean isMinorLimit() { return minorLimit; }
    public boolean isCanDeprecate() { return canDeprecate; }
    public boolean isEditable() { return editable; }
    public boolean isNeverReleased() { return neverReleased; }
    public boolean isCanDeleteCode() { return canDeleteCode; }

    public void setUnappliedCount(int v) { this.unappliedCount = v; }
    public void setCanNewMajor(boolean v) { this.canNewMajor = v; }
    public void setCanNewMinor(boolean v) { this.canNewMinor = v; }
    public void setNextMajor(String v) { this.nextMajor = v; }
    public void setNextMinor(String v) { this.nextMinor = v; }
    public void setMinorLimit(boolean v) { this.minorLimit = v; }
    public void setCanDeprecate(boolean v) { this.canDeprecate = v; }
    public void setEditable(boolean v) { this.editable = v; }
    public void setNeverReleased(boolean v) { this.neverReleased = v; }
    public void setCanDeleteCode(boolean v) { this.canDeleteCode = v; }
}
