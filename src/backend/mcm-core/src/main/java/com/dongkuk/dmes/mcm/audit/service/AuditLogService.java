package com.dongkuk.dmes.mcm.audit.service;

import com.dongkuk.dmes.mcm.audit.entity.AuditLog;
import com.dongkuk.dmes.mcm.audit.repository.AuditLogRepository;
import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import com.dongkuk.dmes.mcm.common.exception.ErrorCode;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service("auditLogService")
public class AuditLogService {

    /** page·size 조회의 한 페이지 상한. 더 큰 size 는 이 값으로 자른다. */
    static final int MAX_PAGE_SIZE = 2000;

    /** page·size 조회 정렬 — 발생 시각 내림차순, 같은 시각은 AUDIT_ID 내림차순(페이지 사이 중복·누락 방지). */
    static final Sort PAGE_SORT = Sort.by(Sort.Order.desc("occurredAt"), Sort.Order.desc("auditId"));

    private final AuditLogRepository auditLogRepository;

    public AuditLogService(AuditLogRepository auditLogRepository) {
        this.auditLogRepository = auditLogRepository;
    }

    /**
     * 감사 로그 조회. 필터 우선순위는 actorUserId → action → 전체 순이다(둘 다 주어지면 actorUserId 만 쓴다).
     *
     * <p>{@code page}(0부터)·{@code size} 가 둘 다 없으면(null·공백 문자열 포함) 이전과 똑같이 동작한다 —
     * 필터 경로는 발생 시각 내림차순 전체, 필터가 없으면 {@code findAll} 전체(정렬 없음).
     *
     * <p>둘 중 하나라도 있으면 그 필터 경로에서 한 페이지만 돌려준다.
     * <ul>
     *   <li>정렬은 발생 시각 내림차순, 같은 시각은 AUDIT_ID 내림차순.</li>
     *   <li>page 가 없으면 0, size 가 없으면 {@value #MAX_PAGE_SIZE}. size 가 {@value #MAX_PAGE_SIZE} 보다 크면 {@value #MAX_PAGE_SIZE} 로 자른다.</li>
     *   <li>숫자 또는 숫자 문자열(앞뒤 공백 허용)만 받는다. 숫자가 아니거나 page 가 음수, size 가 1 보다 작으면
     *       {@link BusinessException}({@link ErrorCode#INVALID_VALUE}).</li>
     * </ul>
     * 반환 형태는 어느 경로든 {@code List<AuditLog>} 다.
     */
    public List<AuditLog> searchByActor(Map<String, Object> request) {
        String actorUserId = (String) request.get("actorUserId");
        Pageable pageable = pageableOf(request);

        if (actorUserId != null && !actorUserId.isBlank()) {
            return pageable == null
                    ? auditLogRepository.findByActorUserIdOrderByOccurredAtDesc(actorUserId)
                    : auditLogRepository.findByActorUserId(actorUserId, pageable);
        }
        // action 은 actorUserId 가 비었을 때만 읽는다(이전과 같은 순서 — 형변환 예외 시점 포함).
        String action = (String) request.get("action");
        if (action != null && !action.isBlank()) {
            return pageable == null
                    ? auditLogRepository.findByActionOrderByOccurredAtDesc(action)
                    : auditLogRepository.findByAction(action, pageable);
        }
        return pageable == null
                ? auditLogRepository.findAll()
                : auditLogRepository.findPage(pageable);
    }

    /** page·size 가 둘 다 없으면 null(페이지 없이 전체). */
    private static Pageable pageableOf(Map<String, Object> request) {
        Integer page = intParam(request, "page");
        Integer size = intParam(request, "size");
        if (page == null && size == null) return null;
        int p = page != null ? page : 0;
        int s = size != null ? size : MAX_PAGE_SIZE;
        if (p < 0) {
            throw new BusinessException(ErrorCode.INVALID_VALUE, "page 는 0 이상이어야 합니다.");
        }
        if (s < 1) {
            throw new BusinessException(ErrorCode.INVALID_VALUE, "size 는 1 이상이어야 합니다.");
        }
        return PageRequest.of(p, Math.min(s, MAX_PAGE_SIZE), PAGE_SORT);
    }

    /** 숫자·숫자 문자열 → int. null·공백 문자열이면 null(없음). */
    private static Integer intParam(Map<String, Object> request, String key) {
        Object v = request.get(key);
        if (v == null) return null;
        if (v instanceof Integer i) return i;
        if (v instanceof Long || v instanceof Short || v instanceof Byte) {
            long l = ((Number) v).longValue();
            return (int) Math.max(Integer.MIN_VALUE, Math.min(Integer.MAX_VALUE, l));
        }
        if (v instanceof String str) {
            String t = str.trim();
            if (t.isEmpty()) return null;
            try {
                return Integer.valueOf(t);
            } catch (NumberFormatException e) {
                throw new BusinessException(ErrorCode.INVALID_VALUE, key + " 는 정수여야 합니다: " + str);
            }
        }
        if (v instanceof Number n) {
            double d = n.doubleValue();
            if (d == Math.rint(d) && !Double.isInfinite(d)) {
                return (int) Math.max(Integer.MIN_VALUE, Math.min(Integer.MAX_VALUE, d));
            }
        }
        throw new BusinessException(ErrorCode.INVALID_VALUE, key + " 는 정수여야 합니다: " + v);
    }

    public List<Map<String, Object>> searchByPeriod(Map<String, Object> request) {
        String fromStr = (String) request.get("from");
        String toStr = (String) request.get("to");
        Instant from = fromStr != null ? Instant.parse(fromStr) : Instant.EPOCH;
        Instant to = toStr != null ? Instant.parse(toStr) : Instant.now();
        List<AuditLog> rows = auditLogRepository.findByPeriod(from, to);
        return rows.stream().map(this::toRow).toList();
    }

    private Map<String, Object> toRow(AuditLog a) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("auditId",     a.getAuditId());
        row.put("action",      a.getAction());
        row.put("targetType",  a.getTargetType());
        row.put("targetId",    a.getTargetId());
        row.put("actorUserId", a.getActorUserId());
        row.put("beforeJson",  a.getBeforeJson());
        row.put("afterJson",   a.getAfterJson());
        row.put("clientIp",    a.getClientIp());
        row.put("occurredAt",  a.getOccurredAt() != null ? a.getOccurredAt().toString() : null);
        return row;
    }
}
