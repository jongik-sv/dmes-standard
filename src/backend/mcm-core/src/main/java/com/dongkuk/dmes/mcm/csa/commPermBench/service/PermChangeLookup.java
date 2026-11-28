/*
 * 작성자: perm-bench-be
 * 작성일: 2026-11-27
 * 내용: PermChangeValidator 가 DB·로그인 정보를 읽는 이음매
 */
package com.dongkuk.dmes.mcm.csa.commPermBench.service;

import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** 변경 검사(V-001·V-002·V-009)에 필요한 읽기. 구현 = {@link DefaultPermChangeLookup}, 시험 = 가짜. */
public interface PermChangeLookup {

    /** 오브젝트가 허용하는 값(TB_MCM_SEC_OBJ.BTN_PERM·POPUP_PERM). */
    record ObjAllowed(List<String> btnPerm, List<String> popupPerm) {
    }

    /** 오브젝트 ID → 허용 값. 없는 오브젝트는 키가 없다. */
    Map<String, ObjAllowed> objectAllowed(Collection<String> objectIds);

    /** 그룹 ID → 그 그룹이 가진 역할 ID(현재 DB). 연결이 없는 그룹은 빈 집합. */
    Map<String, Set<String>> rolesOfGroups(Collection<String> groupIds);

    /** 존재 확인 대상 종류(XV-003). 오브젝트는 {@link #objectAllowed} 로 본다. */
    enum Target { USER, GROUP, ROLE }

    /** 주어진 ID 중 DB 에 있는 것. */
    Set<String> existing(Target kind, Collection<String> ids);

    /** 로그인 사용자가 SYSADMIN 역할을 가졌는가. */
    boolean currentUserIsSysadmin();

    /**
     * SYSADMIN 전용 오브젝트(dbViewer 등) 퍼미션을 가진 역할(현재 DB, m19). 이런 역할을 그룹에 넣고 빼거나
     * 이런 역할이 든 그룹에 사람을 붙이고 떼는 일도 SYSADMIN 만 한다. 기본 = 없음(시험 가짜용).
     */
    default Set<String> rolesWithSysadminOnlyObjects() {
        return Set.of();
    }
}
