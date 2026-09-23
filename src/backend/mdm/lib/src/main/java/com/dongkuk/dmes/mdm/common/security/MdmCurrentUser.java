package com.dongkuk.dmes.mdm.common.security;

import java.util.Set;

/**
 * 요청 사용자와 역할(TSK-01-03 B6). 역할은 {@code ROLE_} 접두를 뗀 역할 ID 집합이다(예: {@code MDM_STEWARD}).
 * 담당자 판정은 서비스가 {@code roleIds().contains(MdmRoles.STEWARD)} 로 한 곳에서 한다.
 */
public interface MdmCurrentUser {

    String userId();

    Set<String> roleIds();
}
