package com.dongkuk.dmes.cactus.oasis;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.common.ErrorCode;
import com.dongkuk.dmes.cactus.common.ResponseCodeAware;
import com.dongkuk.dmes.cactus.web.response.CactusResponse;
import com.dongkuk.dmes.cactus.web.response.ErrorDetail;
import com.dongkuk.dmes.cactus.web.response.GridResult;
import com.dongkuk.dmes.cactus.web.response.ResponseMeta;
import com.dongkuk.oasis.TypedObject;
import com.dongkuk.oasis.service.ServiceResult;
import com.dongkuk.oasis.service.ServiceResultCode;
import com.dongkuk.oasis.transaction.TransactionException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * ServiceResult → CactusResponse 변환기.
 * List 타입 결과는 grids로, 단일 값은 data로 분류한다.
 */
public class CactusResponseConverter {

    private static final ObjectMapper MAPPER = new ObjectMapper()
            .registerModule(new JavaTimeModule())
            .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);

    /**
     * ServiceResult를 CactusResponse로 변환한다.
     * @param result OASIS 서비스 실행 결과
     * @param txId   트랜잭션 ID
     * @return 변환된 CactusResponse
     */
    public CactusResponse convert(ServiceResult result, String txId) {
        if (result.serviceResultCode() == ServiceResultCode.SUCCESS) {
            return convertSuccess(result, txId);
        } else {
            return convertError(result, txId);
        }
    }

    /**
     * 성공 결과를 CactusResponse로 변환한다. List는 grids, 단일 값은 data로 분류.
     */
    @SuppressWarnings("unchecked")
    private CactusResponse convertSuccess(ServiceResult result, String txId) {
        Map<String, Object> data = new HashMap<>();
        Map<String, GridResult> grids = new HashMap<>();

        if (result.results() != null) {
            result.results().forEach((key, typedObject) -> {
                Object value = typedObject.getObject();
                if (value instanceof List<?> list) {
                    List<Map<String, Object>> rows = new java.util.ArrayList<>();
                    for (Object item : list) {
                        if (item == null) {
                            // null row 는 skip (또는 빈 map)
                            continue;
                        }
                        if (item instanceof Map) {
                            rows.add((Map<String, Object>) item);
                        } else if (item instanceof Number || item instanceof String
                                || item instanceof Boolean || item instanceof Character) {
                            // 1.0.22-SNAPSHOT (2026-05-19): primitive/wrapper 안전 처리.
                            // mybatis 의 resultType="long" / "int" / "string" 등 단일 값 결과를
                            // {"value": item} 으로 wrap. 기존 List<Map> 패턴과 일관.
                            Map<String, Object> map = new HashMap<>(2);
                            map.put("value", item);
                            rows.add(map);
                        } else {
                            @SuppressWarnings("unchecked")
                            Map<String, Object> map = MAPPER.convertValue(item, Map.class);
                            rows.add(map);
                        }
                    }
                    grids.put(key, new GridResult(rows));
                } else {
                    data.put(key, value);
                }
            });
        }

        CactusResponse.Builder builder = new CactusResponse.Builder(ResponseMeta.success(txId));
        if (!data.isEmpty()) builder.data(data);
        if (!grids.isEmpty()) builder.grids(grids);
        return builder.build();
    }

    /**
     * 에러 결과를 CactusResponse로 변환한다.
     * {@code meta.code} 는 {@link ResponseCodeAware} 코드 → 사용자 예외 {@code E001} → 업무 예외의 {@link ErrorCode} 코드 →
     * {@code S001}(시스템 오류) 순으로 정한다(2026-10-05, 예전에는 업무 예외도 {@code S001} 이었다 — TSK-04-04 design F12).
     * 원인 사슬에 행 단위 상세를 가진 {@link BusinessException} 이 있으면 그 목록을 {@code errors} 로 더한다
     * ({@code meta} 는 그대로). 상세가 없으면 {@code errors} 는 빠진다(NON_NULL) — 예전과 같은 JSON 이다.
     */
    private CactusResponse convertError(ServiceResult result, String txId) {
        String code = responseCode(result.exception());
        if (code == null && result.serviceResultCode() == ServiceResultCode.USER_ERROR) {
            code = "E001";
        }
        if (code == null) {
            code = businessCode(result.exception());
        }
        if (code == null) {
            code = ErrorCode.INTERNAL_ERROR.getCode();
        }
        String message = result.serviceResultMessage() != null
                ? result.serviceResultMessage()
                : "오류가 발생했습니다.";

        CactusResponse.Builder builder = new CactusResponse.Builder(ResponseMeta.error(txId, code, message));
        List<ErrorDetail> errors = errorDetails(result.exception());
        if (errors != null) builder.errors(errors);
        return builder.build();
    }

    /**
     * 원인 사슬에서 행 단위 상세가 있는 가장 바깥 {@link BusinessException} 의 {@code errors} 를 찾는다(감싸인 예외까지,
     * 순환 방지로 깊이 제한). 없거나 비었으면 null.
     *
     * <p>BPMN serviceTask 가 던진 예외는 {@code CoreServiceStarter} 가 SYSTEM_ERROR + message 로 바꾸지만
     * {@link ServiceResult#exception()} 에 원래 예외를 남긴다 — 그래서 oasis 를 고치지 않고 여기서 꺼낸다
     * (refactor/framework-tx 항목 8, TSK-04-04 design F12).
     */
    private static List<ErrorDetail> errorDetails(Throwable e) {
        Throwable t = e;
        for (int depth = 0; t != null && depth < 16; depth++) {
            if (t instanceof BusinessException be) {
                List<ErrorDetail> errors = be.getErrors();
                if (errors != null && !errors.isEmpty()) {
                    return errors;
                }
            }
            if (t.getCause() == t) {
                break;
            }
            t = t.getCause();
        }
        return null;
    }

    /**
     * 원인 사슬에서 업무 코드를 찾는다 — {@link ResponseCodeAware} 코드, 아니면 cactus {@link BusinessException} 의
     * {@link ErrorCode} 코드. 바깥부터 걸어 트랜잭션 예외(커밋 실패)를 먼저 만나면 시스템 오류라 null 이다
     * (안쪽 업무 예외가 {@code E}·{@code A} 코드로 새지 않게). 업무 예외가 트랜잭션 예외를 원인으로 감싼 재포장은 업무 코드다.
     * 트랜잭션 예외가 아닌 래퍼(리플렉션·{@code DataAccessException} 등)는 경계로 보지 않고 지나간다 — 안쪽 업무 예외의 코드를 쓴다
     * ({@code meta.message} 는 바깥 문구라 어긋날 수 있으나, 2026-10-05 기준 운영 코드에 그런 경로는 없다).
     * {@link OasisServiceExecutor} 의 BPMN 밖 catch 도 이것으로 정한다.
     */
    static String businessCode(Throwable e) {
        String aware = responseCode(e);
        if (aware != null) {
            return aware;
        }
        Throwable t = e;
        for (int depth = 0; t != null && depth < 16; depth++) {
            if (isTransactionFailure(t)) {
                return null;
            }
            if (t instanceof BusinessException be && be.getErrorCode() != null) {
                return be.getErrorCode().getCode();
            }
            if (t.getCause() == t) {
                break;
            }
            t = t.getCause();
        }
        return null;
    }

    private static boolean isTransactionFailure(Throwable t) {
        return t instanceof TransactionException || t instanceof org.springframework.transaction.TransactionException;
    }

    /**
     * 원인 사슬에서 {@link ResponseCodeAware} 예외의 코드를 찾는다(감싸인 예외까지, 순환 방지로 깊이 제한). 바깥부터 걸어 트랜잭션
     * 예외를 먼저 만나면 멈춘다(커밋 실패는 {@code S001}). 없으면 null.
     */
    private static String responseCode(Throwable e) {
        Throwable t = e;
        for (int depth = 0; t != null && depth < 16; depth++) {
            if (isTransactionFailure(t)) {
                return null;
            }
            if (t instanceof ResponseCodeAware aware) {
                String code = aware.responseCode();
                if (code != null && !code.isBlank()) {
                    return code;
                }
            }
            if (t.getCause() == t) {
                break;
            }
            t = t.getCause();
        }
        return null;
    }
}
