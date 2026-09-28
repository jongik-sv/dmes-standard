package com.dongkuk.dmes.mdm.dmd.dataCateEdit.dto;

/**
 * {@code dataCateEdit} action={@code save} 요청 — 한 액션이 두 갈래다(design.md §2). 대상 카테고리가 REGEX 면
 * {@code cateName}·{@code defExpr}·{@code defTarget}·{@code description}(정의 수정)을, TABLE 이면
 * grids {@code addCodes}·{@code removeCodes}(소속 일괄 적용, 전부-아니면-전무 R12, 서비스 메서드 인자)를 쓴다. 어느 갈래인지는 서비스가
 * 지금 저장된 카테고리의 defKind 로 스스로 가른다(클라이언트 입력을 신뢰하지 않는다).
 */
public class CateSaveRequest {

    private String maruDataId;
    private String cateId;
    private String cateName;
    private String defExpr;
    private String defTarget;
    private String description;

    public String getMaruDataId() { return maruDataId; }
    public String getCateId() { return cateId; }
    public String getCateName() { return cateName; }
    public String getDefExpr() { return defExpr; }
    public String getDefTarget() { return defTarget; }
    public String getDescription() { return description; }

    public void setMaruDataId(String v) { this.maruDataId = v; }
    public void setCateId(String v) { this.cateId = v; }
    public void setCateName(String v) { this.cateName = v; }
    public void setDefExpr(String v) { this.defExpr = v; }
    public void setDefTarget(String v) { this.defTarget = v; }
    public void setDescription(String v) { this.description = v; }
}
