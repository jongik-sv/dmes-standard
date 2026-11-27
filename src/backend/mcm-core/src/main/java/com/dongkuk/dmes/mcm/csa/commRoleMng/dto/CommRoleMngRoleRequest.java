/*
 * 작성자: @jongik-sv
 * 작성일: 2026-11-27
 * 내용: commRoleMng searchRoleGroups · saveCmRoleMap · searchFolderObj 액션의 입력 DTO(퍼미션 모델 v2)
 */
package com.dongkuk.dmes.mcm.csa.commRoleMng.dto;

/**
 * commRoleMng 퍼미션 액션의 params DTO.
 *
 * <ul>
 *   <li>{@code searchRoleGroups} — roleId</li>
 *   <li>{@code saveCmRoleMap} — roleId(+ grids {@code perms} 는 메서드 인자로 따로 받는다)</li>
 *   <li>{@code searchFolderObj} — roleId · menuFolderId</li>
 * </ul>
 *
 * <p>OASIS 가 서비스 입력 전체를 Gson 으로 필드 이름에 맞춰 넣는다. 그래서 grid 키({@code perms})·{@code action}
 * 과 같은 이름의 필드를 두지 않는다.
 */
public class CommRoleMngRoleRequest {

    /** 선택한 역할 ID. */
    private String roleId;

    /** 메뉴 폴더 ID(TB_MCM_SEC_MENU_FLD.MENU_ID). searchFolderObj 만 쓴다. */
    private String menuFolderId;

    public CommRoleMngRoleRequest() {}

    public String getRoleId() { return roleId; }
    public void setRoleId(String roleId) { this.roleId = roleId; }

    public String getMenuFolderId() { return menuFolderId; }
    public void setMenuFolderId(String menuFolderId) { this.menuFolderId = menuFolderId; }
}
