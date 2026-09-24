package com.dongkuk.dmes.mdm.common.security;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import java.util.Set;
import org.junit.jupiter.api.Test;

/**
 * TSK-04-04 design.md D1·I14 — 쓰기 가드는 {@code MDM_STD_ADMIN} 역할만 통과시킨다(SYSADMIN 우회 없음).
 */
class MdmStdAdminGuardTest {

    @Test
    void 표준_관리자는_통과한다() {
        assertDoesNotThrow(() -> guard(Set.of("MDM_STD_ADMIN")).requireStdAdmin());
        assertDoesNotThrow(() -> guard(Set.of("SYSADMIN", "MDM_STD_ADMIN")).requireStdAdmin());
    }

    @Test
    void SYSADMIN_담당자_역할_없음은_MDM016() {
        for (Set<String> roles : java.util.List.of(Set.of("SYSADMIN"), Set.of("MDM_STEWARD"), Set.<String>of())) {
            BusinessException e = assertThrows(BusinessException.class, () -> guard(roles).requireStdAdmin());
            assertTrue(e.getMessage().startsWith(MdmErrorCode.STD_ADMIN_ROLE_REQUIRED.defaultMessage()), roles.toString());
        }
    }

    private static MdmStdAdminGuard guard(Set<String> roles) {
        return new MdmStdAdminGuard(new MdmCurrentUser() {
            @Override
            public String userId() {
                return "u";
            }

            @Override
            public Set<String> roleIds() {
                return roles;
            }
        });
    }
}
