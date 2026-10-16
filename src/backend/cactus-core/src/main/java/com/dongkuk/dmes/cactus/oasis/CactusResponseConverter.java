package com.dongkuk.dmes.cactus.oasis;

import com.dongkuk.dmes.cactus.common.BusinessErrorTranslator;
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
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * ServiceResult → CactusResponse 변환기.
 * List 타입 결과는 grids로, 단일 값은 data로 분류한다.
 */
public class CactusResponseConverter {

    private static final Logger log = LoggerFactory.getLogger(CactusResponseConverter.class);

    private static final ObjectMapper MAPPER = new ObjectMapper()
            .registerModule(new JavaTimeModule())
            .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);

    /** 원인 사슬을 걷는 최대 깊이(순환·과도한 감쌈 방지). */
    private static final int MAX_CAUSE_DEPTH = 16;

    /** 업무 예외 변환기 — 목록 순서로 묻고 처음 null 이 아닌 결과를 쓴다. 비었으면 cactus 형만 알아본다. */
    private final List<BusinessErrorTranslator> translators;

    /** 업무 예외 변환기 없이 만든다 — cactus 형만 알아본다. */
    public CactusResponseConverter() {
        this(List.of());
    }

    /**
     * 업무 예외 변환기를 받아 만든다(2026-10-16, BE 리팩토링 2회차 F2).
     * @param translators 업무 예외 변환기 목록. null 이면 빈 목록이고, 불변 사본으로 보관한다
     */
    public CactusResponseConverter(List<BusinessErrorTranslator> translators) {
        this.translators = translators == null ? List.of() : List.copyOf(translators);
    }

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
     * 업무 예외 변환기({@link BusinessErrorTranslator})가 있으면 cactus 형이 아닌 원소의 업무 코드·상세도 그 변환기로 정한다
     * (2026-10-16, BE 리팩토링 2회차 F2). 변환기가 없으면 예전과 같다.
     */
    private CactusResponse convertError(ServiceResult result, String txId) {
        String code = responseCode(result.exception());
        if (code == null && result.serviceResultCode() == ServiceResultCode.USER_ERROR) {
            code = "E001";
        }
        if (code == null) {
            code = businessCodeOf(result.exception());
        }
        if (code == null) {
            code = ErrorCode.INTERNAL_ERROR.getCode();
        }
        String message = result.serviceResultMessage() != null
                ? result.serviceResultMessage()
                : "오류가 발생했습니다.";

        CactusResponse.Builder builder = new CactusResponse.Builder(ResponseMeta.error(txId, code, message));
        List<ErrorDetail> errors = errorDetails(result.exception(), translators);
        if (errors != null) builder.errors(errors);
        return builder.build();
    }

    /**
     * 원인 사슬에서 행 단위 상세가 있는 가장 바깥 원소의 상세를 찾는다(감싸인 예외까지, 순환 방지로 깊이 제한). 원소마다 cactus
     * {@link BusinessException} 의 {@code errors} 를 먼저 보고, 없거나 비었으면 업무 예외 변환기의 상세를 본다. 트랜잭션 예외에서
     * 멈추지 않는다 — 커밋 실패({@code S001})여도 안쪽 업무 예외의 상세는 싣는다. 없으면 null.
     *
     * <p>BPMN serviceTask 가 던진 예외는 {@code CoreServiceStarter} 가 SYSTEM_ERROR + message 로 바꾸지만
     * {@link ServiceResult#exception()} 에 원래 예외를 남긴다 — 그래서 oasis 를 고치지 않고 여기서 꺼낸다
     * (refactor/framework-tx 항목 8, TSK-04-04 design F12).
     */
    private static List<ErrorDetail> errorDetails(Throwable e, List<BusinessErrorTranslator> translators) {
        return firstInCauses(e, false, t -> {
            if (t instanceof BusinessException be) {
                List<ErrorDetail> errors = be.getErrors();
                if (errors != null && !errors.isEmpty()) {
                    return errors;
                }
            }
            return translatedErrors(t, translators);
        });
    }

    /**
     * 원인 사슬에서 업무 코드를 찾는다 — {@link ResponseCodeAware} 코드, 아니면 cactus {@link BusinessException} 의
     * {@link ErrorCode} 코드. 바깥부터 걸어 트랜잭션 예외(커밋 실패)를 먼저 만나면 시스템 오류라 null 이다
     * (안쪽 업무 예외가 {@code E}·{@code A} 코드로 새지 않게). 업무 예외가 트랜잭션 예외를 원인으로 감싼 재포장은 업무 코드다.
     * 트랜잭션 예외가 아닌 래퍼(리플렉션·{@code DataAccessException} 등)는 경계로 보지 않고 지나간다 — 안쪽 업무 예외의 코드를 쓴다
     * ({@code meta.message} 는 바깥 문구라 어긋날 수 있으나, 2026-10-05 기준 운영 코드에 그런 경로는 없다).
     * 업무 예외 변환기는 보지 않는다 — 변환기까지 보는 판정은 {@link #businessCodeOf(Throwable)} 다.
     */
    static String businessCode(Throwable e) {
        return businessCode(e, List.of());
    }

    /**
     * {@link #businessCode(Throwable)} 와 같은 판정에 이 응답 변환기의 업무 예외 변환기를 더한다. 원소마다 cactus
     * {@link BusinessException} 의 {@link ErrorCode} 코드를 먼저 보고, 없으면 업무 예외 변환기 코드를 본다. 바깥 원소가 안쪽 원소보다
     * 앞서고, {@link ResponseCodeAware} 코드는 사슬 어디에 있든 가장 먼저다. {@link OasisServiceExecutor} 의 BPMN 밖 catch 도
     * 이것으로 정한다.
     */
    String businessCodeOf(Throwable e) {
        return businessCode(e, translators);
    }

    /**
     * {@code convertError} 와 같은 상세 판정 — 원소마다 cactus {@link BusinessException} 의 상세를 먼저, 없으면 업무 예외 변환기의
     * 상세를 보고 가장 바깥의 비지 않은 목록을 돌려준다(트랜잭션 예외에서 멈추지 않는다). 없으면 null.
     * {@link OasisServiceExecutor} 의 BPMN 밖 일반 예외 catch 가 쓴다.
     */
    List<ErrorDetail> errorDetailsOf(Throwable e) {
        return errorDetails(e, translators);
    }

    /**
     * 업무 예외 변환기만으로 원인 사슬의 업무 코드를 찾는다 — cactus 형({@link BusinessException}·{@link ResponseCodeAware})은 보지
     * 않는다. 사슬 규칙은 {@link #businessCode(Throwable)} 와 같다(트랜잭션 예외에서 멈춘다). 업무 예외 변환기가 없으면 null.
     * {@link OasisServiceExecutor} 의 BPMN 밖 일반 예외 catch 가 이 값이 있을 때만 업무 예외로 응답한다 — 업무 예외 변환기가 아무것도
     * 알아보지 못한 사슬은 예전처럼 {@code S999} 로 둔다.
     */
    String translatedCodeOf(Throwable e) {
        if (translators.isEmpty()) {
            return null;
        }
        return firstInCauses(e, true, t -> translatedCode(t, translators));
    }

    private static String businessCode(Throwable e, List<BusinessErrorTranslator> translators) {
        String aware = responseCode(e);
        if (aware != null) {
            return aware;
        }
        return firstInCauses(e, true, t -> {
            if (t instanceof BusinessException be && be.getErrorCode() != null) {
                return be.getErrorCode().getCode();
            }
            return translatedCode(t, translators);
        });
    }

    private static boolean isTransactionFailure(Throwable t) {
        return t instanceof TransactionException || t instanceof org.springframework.transaction.TransactionException;
    }

    /**
     * 원인 사슬에서 {@link ResponseCodeAware} 예외의 코드를 찾는다(감싸인 예외까지, 순환 방지로 깊이 제한). 바깥부터 걸어 트랜잭션
     * 예외를 먼저 만나면 멈춘다(커밋 실패는 {@code S001}). 없으면 null.
     */
    private static String responseCode(Throwable e) {
        return firstInCauses(e, true, t -> t instanceof ResponseCodeAware aware ? nonBlank(aware.responseCode()) : null);
    }

    /**
     * 원인 사슬을 바깥부터 걸어 {@code probe} 가 처음으로 null 이 아닌 값을 낸 원소의 값을 돌려준다. 깊이
     * {@value #MAX_CAUSE_DEPTH} 까지 걷고, 자기 자신을 원인으로 가진 예외에서 멈춘다. {@code stopAtTransactionFailure} 면 트랜잭션
     * 예외(커밋 실패)를 만난 때 null 이다. 끝까지 없으면 null.
     */
    private static <T> T firstInCauses(Throwable e, boolean stopAtTransactionFailure, Function<Throwable, T> probe) {
        Throwable t = e;
        for (int depth = 0; t != null && depth < MAX_CAUSE_DEPTH; depth++) {
            if (stopAtTransactionFailure && isTransactionFailure(t)) {
                return null;
            }
            T found = probe.apply(t);
            if (found != null) {
                return found;
            }
            if (t.getCause() == t) {
                break;
            }
            t = t.getCause();
        }
        return null;
    }

    /** 원소 하나의 업무 예외 변환기 코드. 변환 결과가 없거나 코드가 null·빈 값이면 null. */
    private static String translatedCode(Throwable t, List<BusinessErrorTranslator> translators) {
        BusinessErrorTranslator.Translated translated = translate(t, translators);
        return translated != null ? nonBlank(translated.code()) : null;
    }

    /** 원소 하나의 업무 예외 변환기 상세. 변환 결과가 없거나 상세가 null·빈 목록이면 null. */
    private static List<ErrorDetail> translatedErrors(Throwable t, List<BusinessErrorTranslator> translators) {
        BusinessErrorTranslator.Translated translated = translate(t, translators);
        if (translated == null || translated.errors() == null || translated.errors().isEmpty()) {
            return null;
        }
        return translated.errors();
    }

    /**
     * 원소 하나를 업무 예외 변환기에 순서대로 묻고 처음 null 이 아닌 결과를 돌려준다. 업무 예외 변환기가 {@link RuntimeException} 을
     * 던지면 경고 로그만 남기고 그 변환기는 결과 없음으로 본다 — 오류 응답을 만드는 중이라 변환기 결함이 응답을 깨지 않게 한다.
     * {@link Error} 는 잡지 않는다.
     */
    private static BusinessErrorTranslator.Translated translate(Throwable t, List<BusinessErrorTranslator> translators) {
        for (BusinessErrorTranslator translator : translators) {
            try {
                BusinessErrorTranslator.Translated translated = translator.translate(t);
                if (translated != null) {
                    return translated;
                }
            } catch (RuntimeException ex) {
                // 사슬 원소마다·두 걷기마다 불려 응답 하나에 여러 번 남을 수 있다 — 경고는 한 줄로, 스택은 DEBUG 로 남긴다.
                log.warn("[Cactus Oasis] 업무 예외 변환기 {} 가 {} 를 바꾸지 못했다 — 변환 없음으로 본다: {}",
                        translator.getClass().getName(), t.getClass().getName(), ex.toString());
                log.debug("[Cactus Oasis] 업무 예외 변환기 {} 실패 스택", translator.getClass().getName(), ex);
            }
        }
        return null;
    }

    private static String nonBlank(String code) {
        return code != null && !code.isBlank() ? code : null;
    }
}
