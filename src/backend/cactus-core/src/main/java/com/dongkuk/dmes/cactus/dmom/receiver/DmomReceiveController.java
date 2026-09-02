package com.dongkuk.dmes.cactus.dmom.receiver;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.common.ErrorCode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseBody;

/**
 * 전문 수신 API. CaravanHub 가 Kafka 메시지를 HTTP POST 로 전달하는 진입점이다.
 *
 * <p><b>cactus 컨벤션</b>: {@code @Controller} 를 붙이지 않고 <b>class-level {@code @RequestMapping}
 * + {@code @ResponseBody}</b> 로 선언하며, 빈은 autoconfig({@code DmomAutoConfiguration})에서 등록한다.
 * {@code CactusRequestMappingHandlerMapping}(InboundAutoConfiguration)이 class {@code @RequestMapping}
 * 을 핸들러로 인식한다.
 *
 * <p><b>보안</b>(상세설계 §8): {@code /dmomApi/**} 는 cactus 기본 체인의 {@code .anyRequest().authenticated()}
 * 대상이다. CaravanHub 가 고정키 헤더({@code X-Client-Key}+{@code X-Authenticated-User})를 실어 보내면
 * {@code ClientKeyFilter} 가 pre-auth 를 set 하여 통과한다(BFF 신뢰 채널 재사용 — 보안 체인 무변경).
 *
 * <p><b>응답 규약</b>: CaravanHub 는 HTTP status 로 성공/실패를 판정(2xx 성공)한다.
 * <ul>
 *   <li>정상 → 200 {@link DmomReceiveResponse#success}</li>
 *   <li>필수값 누락 → {@code BusinessException(REQUIRED_VALUE)} → 400</li>
 *   <li>디스패치 실패 → {@code DmomException} 전파 → {@code GlobalExceptionHandler} → 500 → CaravanHub 재시도</li>
 * </ul>
 */
@ResponseBody
@RequestMapping("/dmomApi/v1")
public class DmomReceiveController {

    private static final Logger log = LoggerFactory.getLogger(DmomReceiveController.class);

    private final DmomReceiveDispatcher dispatcher;

    public DmomReceiveController(DmomReceiveDispatcher dispatcher) {
        this.dispatcher = dispatcher;
    }

    /** 전문 수신 → 검증 → OASIS 백엔드 기동. */
    @PostMapping("/receive")
    public DmomReceiveResponse receive(@RequestBody DmomReceiveRequest req) {
        validate(req);
        log.info("dmom 수신 TC={} IF={} protocol={}",
                req.transactionCode(), req.interfaceId(), req.interfaceProtocol());
        dispatcher.dispatch(req);
        return DmomReceiveResponse.success(req);
    }

    /** TRANSACTION_CODE / INTERFACE_ID / INTERFACE_MSG 필수. */
    private static void validate(DmomReceiveRequest req) {
        if (req == null) {
            throw new BusinessException(ErrorCode.REQUIRED_VALUE, "요청 본문이 없습니다");
        }
        if (isBlank(req.transactionCode())) {
            throw new BusinessException(ErrorCode.REQUIRED_VALUE, "TRANSACTION_CODE 누락");
        }
        if (isBlank(req.interfaceId())) {
            throw new BusinessException(ErrorCode.REQUIRED_VALUE, "INTERFACE_ID 누락");
        }
        if (req.interfaceMsg() == null) {   // 빈 전문("")은 허용, null 은 불가
            throw new BusinessException(ErrorCode.REQUIRED_VALUE, "INTERFACE_MSG 누락");
        }
    }

    private static boolean isBlank(String s) {
        return s == null || s.isBlank();
    }
}
