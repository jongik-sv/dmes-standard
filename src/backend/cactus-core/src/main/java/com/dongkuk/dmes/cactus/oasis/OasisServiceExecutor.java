package com.dongkuk.dmes.cactus.oasis;

import com.dongkuk.dmes.cactus.audit.CactusAudit;
import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.common.ErrorCode;
import com.dongkuk.dmes.cactus.security.context.UserContextHolder;
import com.dongkuk.dmes.cactus.util.TxIdGenerator;
import com.dongkuk.dmes.cactus.web.request.CactusRequest;
import com.dongkuk.dmes.cactus.web.request.RequestMeta;
import com.dongkuk.dmes.cactus.web.response.CactusResponse;
import com.dongkuk.dmes.cactus.web.response.ResponseMeta;
import com.dongkuk.oasis.TypedObject;
import com.dongkuk.oasis.audit.AuditHolder;
import com.dongkuk.oasis.context.DefaultServiceContext;
import com.dongkuk.oasis.context.ServiceContext;
import com.dongkuk.oasis.service.ServiceResult;
import com.dongkuk.oasis.service.ServiceStarter;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.context.ApplicationContext;

import java.util.Map;

/**
 * CactusRequest → OASIS 서비스 실행 → CactusResponse 전체 흐름을 담당한다.
 */
public class OasisServiceExecutor {

    private static final Logger log = LoggerFactory.getLogger(OasisServiceExecutor.class);

    /** OASIS BPMN 서비스 시작기 */
    private final ServiceStarter serviceStarter;
    /** Spring 애플리케이션 컨텍스트 */
    private final ApplicationContext springApplicationContext;
    /** 요청 변환기 */
    private final CactusRequestConverter requestConverter;
    /** 응답 변환기 */
    private final CactusResponseConverter responseConverter;

    /**
     * OasisServiceExecutor 생성자.
     * @param serviceStarter          OASIS 서비스 시작기
     * @param springApplicationContext Spring 애플리케이션 컨텍스트
     * @param requestConverter        요청 변환기
     * @param responseConverter       응답 변환기
     */
    public OasisServiceExecutor(
            ServiceStarter serviceStarter,
            ApplicationContext springApplicationContext,
            CactusRequestConverter requestConverter,
            CactusResponseConverter responseConverter) {
        this.serviceStarter = serviceStarter;
        this.springApplicationContext = springApplicationContext;
        this.requestConverter = requestConverter;
        this.responseConverter = responseConverter;
    }

    /**
     * 서비스를 실행하고 CactusResponse를 반환한다.
     *
     * @param serviceId    BPMN 서비스 ID
     * @param action       액션 (search, save, delete 등)
     * @param request      CactusRequest
     * @return CactusResponse
     */
    public CactusResponse execute(
            String serviceId, String action, CactusRequest request) {

        RequestMeta reqMeta = request.getMeta();
        String userId = reqMeta != null ? reqMeta.userId() : null;
        String menuId = reqMeta != null ? reqMeta.menuId() : null;
        String txId = TxIdGenerator.generate(userId, menuId);

        long startedAt = System.currentTimeMillis();

        // MDC의 임시 UUID를 정식 txId로 교체
        MDC.put("txId", txId);
        // analog Service List 추출용 — logback 공통 패턴의 [%X{serviceId}] 에 찍힌다 (docs/analog 설계 D6)
        MDC.put("serviceId", serviceId);

        // 감사 정보 설정 (JPA CactusAuditListener, MyBatis CactusMybatisAuditInterceptor가 사용)
        String auditUserId = UserContextHolder.getUserId();
        CactusAudit audit = new CactusAudit(auditUserId, menuId, serviceId);
        AuditHolder.setAudit(audit);

        // analog 서비스 목록의 Action 칸이 이 "serviceId/action" 줄을 파싱한다 — 문구 변경 시 analog application.yml 의 service_action.action_pattern 도 함께 맞춘다.
        log.info("{}/{}", serviceId, action);

        try {
            // 1. CactusRequest → Map<String, TypedObject>
            Map<String, TypedObject> inputs = requestConverter.convert(request, action);

            // 2. ServiceContext 생성 — 두 fix 동시 반영:
            //   (a) CactusUnwrappingApplicationContext 로 CGLIB proxy unwrap. oasis-core 의
            //       SpringApplicationContext 는 proxy bean 을 그대로 반환 → CGLIB enhanced method 의
            //       parameter name 이 손실되어 "ParameterName must not be null" 발생. 본 cactus 구현은
            //       Advised.getTargetSource().getTarget() 으로 target instance 를 추출해 원본
            //       -parameters 컴파일 결과를 보존한다.
            //   (b) OASIS contract: CoreServiceStarter 가 AuditHolder.setAudit(serviceContext.audit()) 로
            //       ScriptTask 실행 직전 덮어쓰므로 sc.setAudit(audit) 를 누락하면 audit 컬럼이 미채움.
            //       setAudit 호출을 위해 ServiceContext 인터페이스 대신 DefaultServiceContext 구상 타입으로 선언.
            com.dongkuk.oasis.context.ApplicationContext oasisAppCtx =
                    new CactusUnwrappingApplicationContext(springApplicationContext);
            DefaultServiceContext sc = new DefaultServiceContext(oasisAppCtx, inputs);
            sc.setAudit(audit);

            // 3. OASIS BPMN 서비스 실행
            ServiceResult result = serviceStarter.start(serviceId, sc);

            // 4. ServiceResult → CactusResponse
            return responseConverter.convert(result, txId);

        } catch (BusinessException e) {
            log.warn("[{}] BusinessException: {}", txId, e.getMessage());
            // BPMN 안쪽 경로(변환기)와 같은 판정 — ResponseCodeAware(MDMnnn) 가 운반용 코드에 가려지지 않는다.
            String code = CactusResponseConverter.businessCode(e);
            return new CactusResponse.Builder(
                    ResponseMeta.error(txId, code != null ? code : ErrorCode.INTERNAL_ERROR.getCode(), e.getMessage()))
                    .errors(e.getErrors())
                    .build();

        } catch (Exception e) {
            log.error("[{}] Unexpected error", txId, e);
            return new CactusResponse.Builder(
                    ResponseMeta.error(txId, ErrorCode.UNKNOWN_ERROR.getCode(), e.getMessage()))
                    .build();

        } finally {
            // analog service_finish extraction 이 이 문구를 파싱한다 — 변경 시 analog application.yml 과 동기화 필수
            log.info("Service end - service name [{}] RunTime : [{}]", serviceId, System.currentTimeMillis() - startedAt);
            MDC.remove("serviceId");
            AuditHolder.remove();
        }
    }
}
