package com.dongkuk.dmes.mdm.common.rule;

import com.dongkuk.dmes.mdm.common.security.MdmCurrentUser;
import com.dongkuk.dmes.mdm.common.security.MdmStewardGuard;
import com.dongkuk.dmes.mdm.contract.security.MdmRoles;
import org.springframework.stereotype.Component;

/**
 * 룰 화면의 담당자 역할 판단 — 유일한 연결 지점(TSK-08-02 design §7.1, I30). 룰 서비스는 역할을 직접 보지 않고 이 클래스만 부른다.
 * 가드의 사본이 아니라 연결 지점이므로 두 메서드 외에 규칙을 두지 않는다.
 *
 * <p>{@link #requireSteward()} 는 TSK-06-02 공용 가드 {@link MdmStewardGuard} 에 위임한다(MDM013). 가드가 불리언 판단을 공개하지
 * 않으므로 {@link #isSteward()} 는 역할 집합을 본다(예외를 잡아 불리언으로 바꾸지 않는다). 소유자 판단은 공통 버전 서비스의
 * OWNER_ID 가 한다.
 */
@Component
public class RuleStewardCheck {

    private final MdmCurrentUser currentUser;
    private final MdmStewardGuard stewardGuard;

    public RuleStewardCheck(MdmCurrentUser currentUser, MdmStewardGuard stewardGuard) {
        this.currentUser = currentUser;
        this.stewardGuard = stewardGuard;
    }

    /** 담당자 역할이 없으면 MDM013. */
    public void requireSteward() {
        stewardGuard.requireSteward();
    }

    public boolean isSteward() {
        return currentUser.roleIds().contains(MdmRoles.STEWARD);
    }
}
