package com.dongkuk.dmes.mdm.dmc.codeCateEdit.dto;

/**
 * {@code codeCateEdit} action={@code compare} 요청 params(TSK-06-04 design.md §1·§2). REGEX 전용 미리보기 — 저장 전
 * 후보 정의(defExpr·defTarget)를 서버 {@code MasterCodeCategoryResolver.resolve} 로 재해석한다. cateId 는 기존 카테고리를
 * 고치는 중이면 그 값(있어도 후보값 defExpr·defTarget 을 우선 쓴다), 신규 카테고리면 null. TABLE 카테고리에는 이 액션을
 * 부르지 않는다(화면 규약). getter/setter 일반 클래스다(record·Lombok 없음 — OASIS dto 바인딩 관례).
 */
public class CodeCatePreviewRequest {

    private String maruCodeId;
    private String ver;
    private String cateId;
    private String defExpr;
    private String defTarget;

    public String getMaruCodeId() { return maruCodeId; }
    public String getVer() { return ver; }
    public String getCateId() { return cateId; }
    public String getDefExpr() { return defExpr; }
    public String getDefTarget() { return defTarget; }

    public void setMaruCodeId(String v) { this.maruCodeId = v; }
    public void setVer(String v) { this.ver = v; }
    public void setCateId(String v) { this.cateId = v; }
    public void setDefExpr(String v) { this.defExpr = v; }
    public void setDefTarget(String v) { this.defTarget = v; }
}
