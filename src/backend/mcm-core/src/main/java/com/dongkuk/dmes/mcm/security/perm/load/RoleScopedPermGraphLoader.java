package com.dongkuk.dmes.mcm.security.perm.load;

import com.dongkuk.dmes.mcm.security.perm.PermGraph;

import java.util.Set;

/**
 * 역할 범위 읽기 — perm-core 가 {@code PermGraphLoader.loadForRoles} 를 계약에 더하기 전까지 쓰는 임시 이음새.
 *
 * <p>작성자: @jongik-sv
 * <p>작성일: 2026-11-27
 * <p>내용: 계약에 들어오면 이 인터페이스를 지우고 PermGraphLoader 를 바로 부른다.
 */
public interface RoleScopedPermGraphLoader {
    /** 역할이 든 그룹의 사람 전부 범위 + 사람 없는 역할의 메타·행. objects·menus 는 전체. */
    PermGraph loadForRoles(Set<String> roleIds);
}
