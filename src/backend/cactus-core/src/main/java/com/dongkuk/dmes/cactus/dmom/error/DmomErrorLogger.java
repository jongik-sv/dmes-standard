package com.dongkuk.dmes.cactus.dmom.error;

import com.dongkuk.dmes.cactus.dmom.message.DmomMessage;
import com.dongkuk.dmes.cactus.dmom.transport.CaravanHubTransport;
import org.mybatis.spring.SqlSessionTemplate;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.HashMap;
import java.util.Map;

/**
 * 송·수신 실패를 {@code TB_MCM_MOM_TC_ERROR} 에 적재.
 *
 * <ul>
 *   <li><b>송신(HTTP) — {@link #log(DmomMessage, Throwable)}, ERROR_TYPE='S'</b>: HTTP 는
 *       {@code afterCommit}(업무 tx 종료 후) 실패이므로 독립 트랜잭션으로 적재한다.
 *       (DB 방식 실패는 {@code createMsg} 예외 → 업무 롤백이라 별도 로그 불요.)</li>
 *   <li><b>수신 — {@link #logReceive(String, String, String, String, Throwable)}, ERROR_TYPE='R'</b>:
 *       수신 서비스 실패 시 OASIS 가 롤백하므로, 동일하게 독립 트랜잭션으로 적재한다.</li>
 * </ul>
 *
 * <p>두 경로 모두 독립 트랜잭션({@code errorTxTemplate}, REQUIRES_NEW)으로 적재하며,
 * 에러 로그 적재 자체의 실패는 삼킨다(원 실패가 본질, 로그 실패로 흐름을 막지 않음).
 */
public class DmomErrorLogger {

    private static final Logger log = LoggerFactory.getLogger(DmomErrorLogger.class);

    private static final int ERROR_CODE_MAX = 100;
    private static final int ERROR_MSG_MAX = 1000;

    private final SqlSessionTemplate bizTemplate;
    private final TransactionTemplate errorTxTemplate;

    public DmomErrorLogger(SqlSessionTemplate bizTemplate, TransactionTemplate errorTxTemplate) {
        this.bizTemplate = bizTemplate;
        this.errorTxTemplate = errorTxTemplate;
    }

    /** HTTP 송신 실패를 TC_ERROR 에 적재(ERROR_TYPE='S', INTERFACE_PROTOCOL=HUB_HTTP). */
    public void log(DmomMessage message, Throwable error) {
        insert(message.transactionCode(), message.interfaceId(), CaravanHubTransport.HTTP.protocol(),
                message.interfaceMsg(), "S", error);
    }

    /**
     * 수신 처리 실패를 TC_ERROR 에 적재(ERROR_TYPE='R').
     *
     * @param transactionCode  트랜잭션 코드
     * @param interfaceId      인터페이스 ID
     * @param interfaceProtocol 수신 프로토콜(요청의 INTERFACE_PROTOCOL — null 허용)
     * @param interfaceMsg     수신 전문(raw)
     * @param error            발생 예외
     */
    public void logReceive(String transactionCode, String interfaceId, String interfaceProtocol,
                           String interfaceMsg, Throwable error) {
        insert(transactionCode, interfaceId, interfaceProtocol, interfaceMsg, "R", error);
    }

    /** 공통 TC_ERROR 적재 (독립 tx, 실패 삼킴). */
    private void insert(String transactionCode, String interfaceId, String interfaceProtocol,
                        String interfaceMsg, String errorType, Throwable error) {
        try {
            errorTxTemplate.executeWithoutResult(status -> {
                Map<String, Object> param = new HashMap<>();
                param.put("transactionCode", transactionCode);
                param.put("interfaceId", interfaceId);
                param.put("interfaceProtocol", interfaceProtocol);
                param.put("interfaceMsg", interfaceMsg);
                param.put("errorType", errorType);                              // 'S'=Send / 'R'=Receive
                param.put("errorCode", truncate(error.getClass().getSimpleName(), ERROR_CODE_MAX));
                param.put("errorMsg", truncate(error.getMessage(), ERROR_MSG_MAX));
                param.put("errorStatusCode", "N");                              // 미처리
                bizTemplate.insert("DmomMapper.insertTcError", param);
            });
        } catch (Exception e) {
            log.error("dmom TC_ERROR 적재 실패 type={} interfaceId={} tc={}",
                    errorType, interfaceId, transactionCode, e);
        }
    }

    private static String truncate(String s, int max) {
        if (s == null) {
            return null;
        }
        return s.length() <= max ? s : s.substring(0, max);
    }
}
