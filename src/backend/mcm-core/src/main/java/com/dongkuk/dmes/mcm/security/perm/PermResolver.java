package com.dongkuk.dmes.mcm.security.perm;

import java.util.Map;
import java.util.Set;

/**
 * 권한 계산기 계약.
 *
 * <p>작성자: @jongik-sv
 * <p>작성일: 2026-11-27
 * <p>내용: 그래프를 입력받는 순수 함수 묶음(D24). 설명·영향·런타임 게이트가 같은 구현을 쓴다.
 *
 * <p>효과 규칙(정본):
 * <ul>
 *   <li>역할×오브젝트 효과 = (perm.BTN ∩ obj.BTN) ∪ (perm.POPUP ∩ obj.POPUP)</li>
 *   <li>SYSADMIN 역할 = 모든 사용 오브젝트 × (obj.BTN ∪ obj.POPUP). 퍼미션 행 없음(D13)</li>
 *   <li>사용 안 함(USE_TP≠Y 이거나 유효 기간 밖)인 역할·그룹·오브젝트는 계산에서 뺀다</li>
 *   <li>런타임 키 = lower(SYSTEM_CODE ?: "mcm")/lower(OBJECT_ID)/action (D26)</li>
 * </ul>
 */
public interface PermResolver {
    /**
     * SYSADMIN 역할 ID. 기존 UserPermCache·SecUserService 의 roleIds.contains("SYSADMIN") 와 같은 값.
     * 지금 런타임은 별칭 {@code "ROLE_SYSADMIN"} 도 받으므로 구현은 둘 다 SYSADMIN 으로 본다.
     */
    String SYSADMIN_ROLE = "SYSADMIN";

    /** OBJECT_ID → 허용 action 집합. */
    Map<String, Set<String>> actionsOf(PermGraph g, String userId);

    /** 사용자×오브젝트 한 쌍의 허용·거부 설명. */
    Explain explain(PermGraph g, String userId, String objectId);

    /** 사용자에게 보이는 오브젝트 ID 집합. */
    Set<String> visibleObjects(PermGraph g, String userId);

    /** 역할이 닿는 오브젝트 ID 집합. */
    Set<String> objectsOfRole(PermGraph g, String roleId);
}
