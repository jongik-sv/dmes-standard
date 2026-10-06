package com.dongkuk.dmes.mcm.searchdefaults.service;

import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import com.dongkuk.dmes.mcm.common.exception.ErrorCode;
import com.dongkuk.dmes.mcm.common.security.SecurityIdentity;
import com.dongkuk.dmes.mcm.searchdefaults.dto.SecSrchDfltPageRequest;
import com.dongkuk.dmes.mcm.searchdefaults.dto.SecSrchDfltSearchRequest;
import com.dongkuk.dmes.mcm.searchdefaults.entity.SecUserSrchDflt;
import com.dongkuk.dmes.mcm.searchdefaults.repository.SecUserSrchDfltRepository;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

/**
 * 사용자 조회 칸 기본값 저장 — OASIS {@code secSrchDflt}(스펙 2026-10-07-search-defaults-design §5.3).
 * 사용자는 늘 인증 컨텍스트에서 얻는다(IDOR, 요청에 userId 칸 자체가 없다). 쓰기 원자성은 {@link SecSrchDfltWriter} 가 맡는다 —
 * 이 클래스에는 {@code @Transactional} 을 붙이지 않는다(BackEnd 표준 §6-B-1).
 * <p>규칙 JSON 은 검사한 뒤 알려진 칸만 다시 만든 정규형으로 저장한다(모르는 칸·공백은 버린다).
 */
@Service("secSrchDfltService")
public class SecSrchDfltService {

    static final int MAX_ROWS_PER_PAGE = 50;
    static final int PAGE_ID_MAX = 200;
    static final int FIELD_KEY_MAX = 100;
    static final int RULE_JSON_MAX = 1000;
    static final int FIELD_META_MAX = 50;
    static final int FIELD_LABEL_MAX = 100;
    static final int FIXED_VALUE_MAX = 500;
    static final int MAX_MONTHS = 120;
    static final int MAX_DAYS = 3660;
    private static final Set<String> BASES = Set.of("today", "monthStart", "monthEnd");

    private static final ObjectMapper JSON = new ObjectMapper()
            .enable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS);

    private final SecUserSrchDfltRepository repository;
    private final SecSrchDfltWriter writer;
    private final SecurityIdentity securityIdentity;

    @Autowired
    public SecSrchDfltService(SecUserSrchDfltRepository repository, SecSrchDfltWriter writer,
                              SecurityIdentity securityIdentity) {
        this.repository = repository;
        this.writer = writer;
        this.securityIdentity = securityIdentity;
    }

    /** 사용자의 모든 행(미리 받기용). 응답은 {@code {rows: [{pageId, fieldKey, ruleJson, fieldMeta, fieldLabel}]}}. */
    public Map<String, Object> search(SecSrchDfltSearchRequest request) {
        String userId = requireUser();
        List<Map<String, Object>> rows = new ArrayList<>();
        for (SecUserSrchDflt e : repository.findByUserIdOrderByPageIdAscFieldKeyAsc(userId)) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("pageId", e.getPageId());
            m.put("fieldKey", e.getFieldKey());
            m.put("ruleJson", e.getRuleJson());
            m.put("fieldMeta", e.getFieldMeta());
            m.put("fieldLabel", e.getFieldLabel());
            rows.add(m);
        }
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("rows", rows);
        return result;
    }

    /** 한 화면의 행을 통째로 바꾼다. 행 목록은 grids.rows.rows. 빈 목록이면 그 화면의 행을 모두 지운다. */
    public Map<String, Object> savePage(SecSrchDfltPageRequest request, List<Map<String, Object>> rows) {
        String userId = requireUser();
        String pageId = requirePageId(request == null ? null : request.getPageId());
        List<Map<String, Object>> input = rows == null ? List.of() : rows;
        if (input.size() > MAX_ROWS_PER_PAGE) {
            throw new BusinessException(ErrorCode.BUSINESS_ERROR,
                    "조회 기본값은 화면당 " + MAX_ROWS_PER_PAGE + "칸까지 정할 수 있습니다.");
        }
        List<SecSrchDfltWriter.RowValues> values = new ArrayList<>();
        Set<String> keys = new HashSet<>();
        for (Map<String, Object> row : input) {
            SecSrchDfltWriter.RowValues v = toRow(row);
            if (!keys.add(v.fieldKey())) {
                throw new BusinessException(ErrorCode.DUPLICATE_DATA, "같은 칸 키가 두 번 있습니다: " + v.fieldKey());
            }
            values.add(v);
        }
        writer.replacePage(userId, pageId, values);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("pageId", pageId);
        result.put("savedCount", values.size());
        return result;
    }

    /** 한 화면의 행을 지운다. */
    public Map<String, Object> resetPage(SecSrchDfltPageRequest request) {
        String userId = requireUser();
        String pageId = requirePageId(request == null ? null : request.getPageId());
        int deleted = writer.deletePage(userId, pageId);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("pageId", pageId);
        result.put("deletedCount", deleted);
        return result;
    }

    private String requireUser() {
        String userId = securityIdentity.currentUserId();
        if (userId == null || userId.isBlank()) {
            throw new BusinessException(ErrorCode.AUTH_FAILED, "인증 정보가 없습니다.");
        }
        return userId;
    }

    private static String requirePageId(String raw) {
        String pageId = trim(raw);
        if (pageId == null || pageId.isEmpty()) {
            throw new BusinessException(ErrorCode.REQUIRED_VALUE, "화면 ID 를 입력해 주세요.");
        }
        if (pageId.length() > PAGE_ID_MAX || hasControl(pageId)) {
            throw new BusinessException(ErrorCode.INVALID_VALUE, "화면 ID 형식이 올바르지 않습니다.");
        }
        return pageId;
    }

    private static SecSrchDfltWriter.RowValues toRow(Map<String, Object> row) {
        if (row == null) {
            throw new BusinessException(ErrorCode.INVALID_VALUE, "조회 기본값 행이 비어 있습니다.");
        }
        String fieldKey = text(row.get("fieldKey"));
        if (fieldKey == null || fieldKey.isEmpty() || fieldKey.length() > FIELD_KEY_MAX || hasControl(fieldKey)) {
            throw new BusinessException(ErrorCode.INVALID_VALUE, "칸 키가 올바르지 않습니다.");
        }
        String fieldMeta = text(row.get("fieldMeta"));
        if (fieldMeta != null && fieldMeta.isEmpty()) fieldMeta = null;
        if (fieldMeta != null && (fieldMeta.length() > FIELD_META_MAX || hasControl(fieldMeta))) {
            throw new BusinessException(ErrorCode.INVALID_VALUE, "칸 표준 용어가 올바르지 않습니다: " + fieldKey);
        }
        String fieldLabel = text(row.get("fieldLabel"));
        if (fieldLabel != null && fieldLabel.isEmpty()) fieldLabel = null;
        if (fieldLabel != null && (fieldLabel.length() > FIELD_LABEL_MAX || hasControl(fieldLabel))) {
            throw new BusinessException(ErrorCode.INVALID_VALUE, "칸 라벨이 올바르지 않습니다: " + fieldKey);
        }
        return new SecSrchDfltWriter.RowValues(fieldKey, canonicalRule(row.get("ruleJson"), fieldKey), fieldMeta, fieldLabel);
    }

    /** 규칙 JSON 을 검사해 정규형 문자열로 돌려준다. 위반하면 칸 키를 넣은 메시지로 거절한다. */
    static String canonicalRule(Object raw, String fieldKey) {
        String text = raw instanceof String s ? s : null;
        if (text == null || text.isBlank()) {
            throw invalid("규칙이 비어 있습니다", fieldKey);
        }
        if (text.length() > RULE_JSON_MAX) {
            throw invalid("규칙이 너무 깁니다", fieldKey);
        }
        JsonNode node;
        try {
            node = JSON.readTree(text);
        } catch (Exception e) {
            throw invalid("규칙이 JSON 형식이 아닙니다", fieldKey);
        }
        if (node == null || !node.isObject()) {
            throw invalid("규칙은 JSON 객체여야 합니다", fieldKey);
        }
        JsonNode kind = node.get("kind");
        if (kind == null || !kind.isTextual()) {
            throw invalid("규칙 종류(kind)가 없습니다", fieldKey);
        }
        ObjectNode out = JSON.createObjectNode();
        switch (kind.asText()) {
            case "fixed" -> {
                JsonNode value = node.get("value");
                if (value == null || !value.isTextual()) {
                    throw invalid("고정 값(value)은 문자열이어야 합니다", fieldKey);
                }
                if (value.asText().length() > FIXED_VALUE_MAX || hasControl(value.asText())) {
                    throw invalid("고정 값이 올바르지 않습니다", fieldKey);
                }
                out.put("kind", "fixed");
                out.put("value", value.asText());
            }
            case "relative" -> {
                JsonNode base = node.get("base");
                if (base == null || !base.isTextual() || !BASES.contains(base.asText())) {
                    throw invalid("상대 날짜 기준(base)이 올바르지 않습니다", fieldKey);
                }
                out.put("kind", "relative");
                out.put("base", base.asText());
                putBounded(node, out, "months", MAX_MONTHS, fieldKey);
                putBounded(node, out, "days", MAX_DAYS, fieldKey);
            }
            case "last" -> out.put("kind", "last");
            default -> throw invalid("알 수 없는 규칙 종류입니다", fieldKey);
        }
        return out.toString();
    }

    /** 있으면 정수이고 ±limit 안이어야 한다. 없거나 null 이면 정규형에 싣지 않는다. */
    private static void putBounded(JsonNode in, ObjectNode out, String name, int limit, String fieldKey) {
        JsonNode v = in.get(name);
        if (v == null || v.isNull()) return;
        if (!v.isIntegralNumber() || !v.canConvertToInt() || Math.abs(v.asInt()) > limit) {
            throw invalid(name + " 는 ±" + limit + " 이내 정수여야 합니다", fieldKey);
        }
        out.put(name, v.asInt());
    }

    private static BusinessException invalid(String message, String fieldKey) {
        return new BusinessException(ErrorCode.INVALID_VALUE, message + ": " + fieldKey);
    }

    private static String text(Object v) {
        return v == null ? null : trim(String.valueOf(v));
    }

    private static String trim(String s) {
        return s == null || "null".equals(s) ? null : s.trim();
    }

    private static boolean hasControl(String s) {
        for (int i = 0; i < s.length(); i++) {
            if (Character.isISOControl(s.charAt(i))) return true;
        }
        return false;
    }
}
