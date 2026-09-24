package com.dongkuk.dmes.mdm.common.security;

import com.dongkuk.dmes.mdm.common.support.MdmErrors;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import com.dongkuk.dmes.mdm.contract.security.MdmRoles;
import org.springframework.stereotype.Component;

/**
 * 표준 관리자 쓰기 가드(TSK-04-04 design.md D1, 불변 규칙 I14). BFF 액션 권한(1차)과 별도로 서비스가 요청 역할을
 * 직접 본다. SYSADMIN·MDM_STEWARD 만으로는 거부한다 — TSK-01-03 {@code requireSteward} 와 같은 모양이다.
 */
@Component
public class MdmStdAdminGuard {

    private final MdmCurrentUser currentUser;

    public MdmStdAdminGuard(MdmCurrentUser currentUser) {
        this.currentUser = currentUser;
    }

    public void requireStdAdmin() {
        if (!currentUser.roleIds().contains(MdmRoles.STD_ADMIN)) {
            throw MdmErrors.of(MdmErrorCode.STD_ADMIN_ROLE_REQUIRED);
        }
    }
}
