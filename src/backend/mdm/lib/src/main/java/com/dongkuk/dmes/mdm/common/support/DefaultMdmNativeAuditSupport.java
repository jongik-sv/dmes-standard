package com.dongkuk.dmes.mdm.common.support;

import com.dongkuk.dmes.cactus.audit.CactusAudit;
import com.dongkuk.dmes.cactus.security.context.UserContextHolder;
import com.dongkuk.dmes.cactus.security.context.UserInfo;
import com.dongkuk.dmes.mdm.contract.common.AuditStamp;
import com.dongkuk.dmes.mdm.contract.common.MdmNativeAuditSupport;
import com.dongkuk.oasis.audit.Audit;
import com.dongkuk.oasis.audit.AuditHolder;
import java.time.Clock;
import java.time.Instant;
import org.springframework.stereotype.Component;

/**
 * 네이티브 쓰기용 감사 값(TSK-01-03 B3). {@code CactusAuditListener} 와 같은 대응을 쓴다:
 * U_SVC_ID ← serviceId, U_PGM_ID ← menuId. OASIS 문맥이 없으면 요청 사용자, 그것도 없으면 null.
 */
@Component
public class DefaultMdmNativeAuditSupport implements MdmNativeAuditSupport {

    private final Clock clock;

    public DefaultMdmNativeAuditSupport(Clock clock) {
        this.clock = clock;
    }

    @Override
    public AuditStamp currentStamp() {
        Instant at = Instant.now(clock);
        Audit audit = AuditHolder.getAudit();
        if (audit instanceof CactusAudit cactus) {
            return new AuditStamp(cactus.userId(), cactus.serviceId(), cactus.menuId(), at);
        }
        UserInfo user = UserContextHolder.get();
        return new AuditStamp(user != null ? user.userId() : null, null, null, at);
    }
}
