package com.dongkuk.dmes.mcm.security.perm;

/**
 * 권한 변경 한 줄.
 *
 * <p>작성자: @jongik-sv
 * <p>작성일: 2026-11-27
 * <p>내용: 작업대 초안의 변경 단위. JSON 친화를 위해 필드는 모두 String 이다.
 * <ul>
 *   <li>USER_GRP: key1=userId, key2=groupId</li>
 *   <li>GRP_ROLE: key1=groupId, key2=roleId</li>
 *   <li>ROLE_OBJ: key1=roleId, key2=objectId, btnPerm·popupPerm = 쉼표 구분 코드</li>
 * </ul>
 */
public record PermChange(String tp, String key1, String key2, String op, String btnPerm, String popupPerm) {
    public static final String USER_GRP = "USER_GRP";
    public static final String GRP_ROLE = "GRP_ROLE";
    public static final String ROLE_OBJ = "ROLE_OBJ";
    public static final String ADD = "ADD";
    public static final String DEL = "DEL";
    public static final String UPD = "UPD";

    /** USER_GRP / GRP_ROLE 추가·삭제용. */
    public static PermChange link(String tp, String key1, String key2, String op) {
        return new PermChange(tp, key1, key2, op, null, null);
    }

    /** ROLE_OBJ 추가·수정·삭제용. */
    public static PermChange roleObj(String roleId, String objectId, String op, String btnPerm, String popupPerm) {
        return new PermChange(ROLE_OBJ, roleId, objectId, op, btnPerm, popupPerm);
    }
}
