package com.dongkuk.dmes.mcm.security.perm;

/**
 * 메뉴 노드.
 *
 * <p>작성자: @jongik-sv
 * <p>작성일: 2026-11-27
 * <p>내용: 메뉴 트리 한 칸. objectId 가 비면 폴더. visible = 표시 여부(SHOW_YN), useTp = 사용 여부.
 */
public record MenuNode(String menuId, String parentMenuId, String objectId, boolean visible, String useTp) {
}
