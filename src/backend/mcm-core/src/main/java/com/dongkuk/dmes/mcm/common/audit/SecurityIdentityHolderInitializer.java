package com.dongkuk.dmes.mcm.common.audit;

import com.dongkuk.dmes.mcm.common.security.SecurityIdentity;
import org.springframework.stereotype.Component;

/**
 * {@link SecurityIdentityHolder} 부팅 시 초기화.
 * Spring 컨텍스트가 SecurityIdentity 빈을 생성한 직후 본 컴포넌트가 holder 에 등록.
 */
@Component
public class SecurityIdentityHolderInitializer {

    public SecurityIdentityHolderInitializer(SecurityIdentity securityIdentity) {
        SecurityIdentityHolder.set(securityIdentity);
    }
}
