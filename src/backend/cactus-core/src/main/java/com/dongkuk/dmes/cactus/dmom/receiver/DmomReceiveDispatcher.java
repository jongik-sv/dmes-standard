package com.dongkuk.dmes.cactus.dmom.receiver;

import com.dongkuk.dmes.cactus.audit.CactusAudit;
import com.dongkuk.dmes.cactus.dmom.DmomException;
import com.dongkuk.dmes.cactus.dmom.error.DmomErrorLogger;
import com.dongkuk.oasis.TypedObject;
import com.dongkuk.oasis.audit.AuditHolder;
import com.dongkuk.oasis.context.DefaultServiceContext;
import com.dongkuk.oasis.service.ServiceResult;
import com.dongkuk.oasis.service.ServiceResultCode;
import com.dongkuk.oasis.service.ServiceStarter;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationContext;

import java.util.HashMap;
import java.util.Map;

/**
 * 수신 전문을 <b>OASIS BPMN 서비스로 백엔드 직접 기동</b>한다(웹 미경유; 상세설계 R4/R5/§4.2).
 *
 * <ul>
 *   <li>serviceId = {@code TRANSACTION_CODE} (R4 — 매핑 테이블 없음).</li>
 *   <li>raw 전문을 context 에 적재하고 기동 — <b>역파싱은 BPMN 첫 태스크</b>({@link DmomParseMessageTask}).</li>
 *   <li>시스템 audit({@code SYSTEM}) 로 수신 서비스의 감사 컬럼을 채운다.</li>
 *   <li>{@code serviceStarter.start} 는 OASIS Spring tx 안에서 실행 → 커밋/롤백 자동. 실패 시
 *       TC_ERROR('R') 적재 후 {@link DmomException} 전파 → {@code GlobalExceptionHandler} 5xx
 *       → CaravanHub 재시도.</li>
 * </ul>
 *
 * <p>{@code OasisServiceExecutor} 와 동일 패턴(웹 진입만 다름).
 */
public class DmomReceiveDispatcher {

    private static final Logger log = LoggerFactory.getLogger(DmomReceiveDispatcher.class);

    /** 레거시 {@code DEFAULT_GROUP_NONUI} 대응 — 비-UI 액션. */
    private static final String RECEIVE_ACTION = "nonui";
    private static final String AUDIT_USER = "SYSTEM";
    private static final String AUDIT_MENU = "DMOM_RECV";

    private final ServiceStarter serviceStarter;
    private final ApplicationContext springApplicationContext;
    private final DmomErrorLogger errorLogger;

    public DmomReceiveDispatcher(ServiceStarter serviceStarter,
                                 ApplicationContext springApplicationContext,
                                 DmomErrorLogger errorLogger) {
        this.serviceStarter = serviceStarter;
        this.springApplicationContext = springApplicationContext;
        this.errorLogger = errorLogger;
    }

    /**
     * 수신 요청을 OASIS 서비스(serviceId=TC)로 기동한다.
     *
     * @param req 수신 요청
     * @throws DmomException 서비스 결과가 SUCCESS 가 아니거나 실행 중 예외 발생 시
     */
    public void dispatch(DmomReceiveRequest req) {
        String serviceId = req.transactionCode();

        Map<String, TypedObject> inputs = new HashMap<>();
        inputs.put("action", new TypedObject(RECEIVE_ACTION));
        inputs.put("transactionCode", new TypedObject(req.transactionCode()));
        inputs.put("interfaceId", new TypedObject(req.interfaceId()));
        inputs.put("interfaceMsg", new TypedObject(req.interfaceMsg() == null ? "" : req.interfaceMsg()));
        if (req.kafkaKeyData() != null) {
            inputs.put("kafkaKeyData", new TypedObject(req.kafkaKeyData()));
        }
        if (req.interfaceProtocol() != null) {
            inputs.put("interfaceProtocol", new TypedObject(req.interfaceProtocol()));
        }

        CactusAudit audit = new CactusAudit(AUDIT_USER, AUDIT_MENU, serviceId);
        AuditHolder.setAudit(audit);
        try {
            com.dongkuk.oasis.context.ApplicationContext oasisCtx =
                    new com.dongkuk.dmes.cactus.oasis.CactusUnwrappingApplicationContext(springApplicationContext);
            DefaultServiceContext sc = new DefaultServiceContext(oasisCtx, inputs);
            sc.setAudit(audit);

            ServiceResult result = serviceStarter.start(serviceId, sc);

            // ★ ServiceResult 는 record 스타일 접근자(get 접두사 없음).
            if (result == null || result.serviceResultCode() != ServiceResultCode.SUCCESS) {
                String code = result == null ? "null" : String.valueOf(result.serviceResultCode());
                String msg = result == null ? null : result.serviceResultMessage();
                throw new DmomException("수신 서비스 실패 TC=" + serviceId + " code=" + code + " msg=" + msg);
            }
        } catch (RuntimeException e) {
            log.warn("dmom 수신 실패 TC={} IF={}: {}", serviceId, req.interfaceId(), e.getMessage());
            errorLogger.logReceive(req.transactionCode(), req.interfaceId(),
                    req.interfaceProtocol(), req.interfaceMsg(), e);
            throw (e instanceof DmomException) ? e
                    : new DmomException("수신 처리 실패 TC=" + serviceId, e);
        } finally {
            AuditHolder.remove();
        }
    }
}
