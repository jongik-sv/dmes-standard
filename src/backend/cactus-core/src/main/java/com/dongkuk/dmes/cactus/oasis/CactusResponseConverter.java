package com.dongkuk.dmes.cactus.oasis;

import com.dongkuk.dmes.cactus.common.ResponseCodeAware;
import com.dongkuk.dmes.cactus.web.response.CactusResponse;
import com.dongkuk.dmes.cactus.web.response.GridResult;
import com.dongkuk.dmes.cactus.web.response.ResponseMeta;
import com.dongkuk.oasis.TypedObject;
import com.dongkuk.oasis.service.ServiceResult;
import com.dongkuk.oasis.service.ServiceResultCode;
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
     */
    private CactusResponse convertError(ServiceResult result, String txId) {
        String code = responseCode(result.exception());
        if (code == null) {
            code = (result.serviceResultCode() == ServiceResultCode.USER_ERROR) ? "E001" : "S001";
        }
        String message = result.serviceResultMessage() != null
                ? result.serviceResultMessage()
                : "오류가 발생했습니다.";

        return new CactusResponse.Builder(ResponseMeta.error(txId, code, message)).build();
    }

    /** 원인 사슬에서 {@link ResponseCodeAware} 예외의 코드를 찾는다(감싸인 예외까지, 순환 방지로 깊이 제한). 없으면 null. */
    private static String responseCode(Throwable e) {
        Throwable t = e;
        for (int depth = 0; t != null && depth < 16; depth++) {
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
