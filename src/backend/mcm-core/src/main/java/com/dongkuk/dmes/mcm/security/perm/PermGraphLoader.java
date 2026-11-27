package com.dongkuk.dmes.mcm.security.perm;

import java.util.Set;

/**
 * 권한 그래프 로더.
 *
 * <p>작성자: @jongik-sv
 * <p>작성일: 2026-11-27
 * <p>내용: DB 에서 {@link PermGraph} 를 읽는 계약. 구현은 load 레인이 맡는다.
 */
public interface PermGraphLoader {
    /** 지정 사용자에게 닿는 범위만 읽는다. 사람·그룹·역할·퍼미션만 좁히고 objects·menus 는 전체를 싣는다. */
    PermGraph loadForUsers(Set<String> userIds);

    /**
     * 지정 역할에 닿는 범위만 읽는다. 지금 그 역할이 든 그룹의 사람 전부 + 사람 없는 역할의 행을 싣는다.
     * 역할 기준 메뉴 트리(현재 상태) 전용이다. 초안 영향 계산에는 쓰지 않는다(GRP_ROLE·USER_GRP 추가 때 범위가 모자람) —
     * {@link #loadAll()} 을 쓴다.
     *
     * <p>기본 구현은 {@link #loadAll()}(범위가 넓을 뿐 결과는 맞다). 구현은 좁혀 읽도록 덮어쓴다.
     */
    default PermGraph loadForRoles(Set<String> roleIds) {
        return loadAll();
    }

    /** 전체를 읽는다. */
    PermGraph loadAll();
}
