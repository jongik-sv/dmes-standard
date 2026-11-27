/*
 * 작성자: @junhwan-park
 * 작성일: 2026-06-01
 * 내용: commPermMng search 액션의 입력 DTO — 퍼미션(역할×오브젝트) 조회 조건
 *       2026-11-27 @jongik-sv: 퍼미션 모델 v2 로 조건 교체(옛 PERMISSION_ID 묶음 조건 삭제)
 */
package com.dongkuk.dmes.mcm.csa.commPermMng.dto;

/**
 * commPermMng {@code search} action(메서드 {@code searchCmPerm})의 입력 DTO.
 *
 * <p>OASIS 가 CactusRequest {@code params} 를 필드 이름 그대로 이 DTO 로 바꾼다(Gson).
 * {@code pageNo}·{@code pageSize} 는 숫자로 와도 받도록 문자열로 두고 서비스가 해석한다.
 */
public class CommPermMngSearchRequest {

    /** 역할 ID — 같음. 빈 값 = 전체(SYSADMIN 제외). */
    private String roleId;

    /** 메뉴 ID(모듈 또는 폴더) — 그 아래 메뉴가 가리키는 오브젝트만. 빈 값 = 전체. */
    private String menuId;

    /** 오브젝트 ID·이름 부분 일치(대소문자 무시). */
    private String objectQ;

    /** 버튼·팝업 코드 부분 일치(대소문자 무시). */
    private String codeQ;

    /** Y = 고른 역할의 퍼미션 없는 오브젝트도 줄로 낸다(roleId 가 비면 무시). */
    private String showEmpty;

    /** 1부터. 빈 값 = 1. */
    private String pageNo;

    /** 빈 값 = 100, 최대 1000. */
    private String pageSize;

    public CommPermMngSearchRequest() {}

    public String getRoleId() { return roleId; }
    public void setRoleId(String roleId) { this.roleId = roleId; }

    public String getMenuId() { return menuId; }
    public void setMenuId(String menuId) { this.menuId = menuId; }

    public String getObjectQ() { return objectQ; }
    public void setObjectQ(String objectQ) { this.objectQ = objectQ; }

    public String getCodeQ() { return codeQ; }
    public void setCodeQ(String codeQ) { this.codeQ = codeQ; }

    public String getShowEmpty() { return showEmpty; }
    public void setShowEmpty(String showEmpty) { this.showEmpty = showEmpty; }

    public String getPageNo() { return pageNo; }
    public void setPageNo(String pageNo) { this.pageNo = pageNo; }

    public String getPageSize() { return pageSize; }
    public void setPageSize(String pageSize) { this.pageSize = pageSize; }
}
