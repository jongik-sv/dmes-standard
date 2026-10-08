package com.dongkuk.dmes.cactus.job;

import com.dongkuk.dmes.cactus.audit.CactusAudit;
import com.dongkuk.dmes.cactus.oasis.CactusUnwrappingApplicationContext;
import com.dongkuk.oasis.TypeReference;
import com.dongkuk.oasis.TypedObject;
import com.dongkuk.oasis.audit.AuditHolder;
import com.dongkuk.oasis.context.DefaultServiceContext;
import com.dongkuk.oasis.service.ServiceResult;
import com.dongkuk.oasis.service.ServiceStarter;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.springframework.context.ApplicationContext;

/**
 * 웹 요청 없이 OASIS 서비스를 직접 기동하는 도우미 — {@code DmomReceiveDispatcher}·{@code OasisServiceExecutor} 와 같은 순서이다
 * (감사 주체를 {@code AuditHolder} 와 {@code DefaultServiceContext.setAudit} 에 모두 넣고, 끝에 {@code AuditHolder.remove()}).
 * 진입점과 MCM 판정 트리거가 함께 쓴다.
 */
public final class JobServiceInvoker {

    private JobServiceInvoker() {}

    public static ServiceResult start(ServiceStarter starter, ApplicationContext spring, String serviceId,
                                      Map<String, Object> inputs, CactusAudit audit) {
        AuditHolder.setAudit(audit);
        try {
            com.dongkuk.oasis.context.ApplicationContext oasisCtx = new CactusUnwrappingApplicationContext(spring);
            DefaultServiceContext sc = new DefaultServiceContext(oasisCtx, typed(inputs));
            sc.setAudit(audit);
            return starter.start(serviceId, sc);
        } finally {
            AuditHolder.remove();
        }
    }

    /** 제네릭 값(Map·List)은 {@link TypedObject} 가 형을 명시해야 하고, null 은 형을 따로 줘야 한다. */
    public static Map<String, TypedObject> typed(Map<String, Object> inputs) {
        Map<String, TypedObject> out = new HashMap<>();
        inputs.forEach((k, v) -> out.put(k, typedValue(v)));
        return out;
    }

    static TypedObject typedValue(Object v) {
        if (v == null) return new TypedObject(null, String.class);
        if (v instanceof Map) return new TypedObject(v, new TypeReference<Map<String, Object>>() {});
        if (v instanceof List) return new TypedObject(v, new TypeReference<List<Object>>() {});
        return new TypedObject(v);
    }
}
