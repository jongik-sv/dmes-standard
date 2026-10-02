package com.dongkuk.dmes.mcm.security.endpoint;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

/**
 * spec 2026-10-02-mdm-meta-cache-design §5.5 — 업무 모듈 cactus 엔드포인트 /api/{module}/mdmMeta/* 는 3-segment 라 PermKey 의 serviceId 가 ""
 * 이고(PermKey.java:62-66) UserPermCache 키는 "oasis" 라(UserPermCache.java:219) 권한 데이터로 맞출 수 없다. 인증만 보는 AUTH_ONLY 로 두고,
 * 관리 action(status·entries·load)은 cactus MdmMetaController 가 SYSADMIN 을 다시 본다.
 */
class EndpointPermissionFilterAuthOnlyTest {

    @Test
    void mdmMeta_는_AUTH_ONLY_다() {
        for (String action : new String[] {"columns", "domains", "status", "entries", "load"}) {
            PermKey k = PermKey.parseUrl("/api/mcm/mdmMeta/" + action);
            assertNotNull(k, action);
            assertTrue(EndpointPermissionFilter.isAuthOnly(k), action);
        }
        assertFalse(EndpointPermissionFilter.isAuthOnly(PermKey.parseUrl("/api/mcm/oasis/commUserMng/search")));
    }
}
