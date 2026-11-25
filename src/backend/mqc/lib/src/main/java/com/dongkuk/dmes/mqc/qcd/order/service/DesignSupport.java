package com.dongkuk.dmes.mqc.qcd.order.service;

import com.dongkuk.dmes.cactus.audit.CactusAudit;
import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.common.ErrorCode;
import com.dongkuk.oasis.audit.AuditHolder;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Clock;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** 품질설계결과·시뮬레이션 서비스 도우미 — 처리자, 시각(KST, 초 단위), JSON, 업무 오류. */
public final class DesignSupport {

    public static final ZoneId KST = ZoneId.of("Asia/Seoul");
    public static final DateTimeFormatter DATE_TIME = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm");
    private static final ObjectMapper JSON = new ObjectMapper();

    private DesignSupport() {
    }

    public static Clock systemClock() {
        return Clock.system(KST);
    }

    public static LocalDateTime now(Clock clock) {
        return LocalDateTime.now(clock).truncatedTo(ChronoUnit.SECONDS);
    }

    /** 처리자 — 요청 감사 정보의 사용자 ID. 없으면 system. */
    public static String actor() {
        Object audit = AuditHolder.getAudit();
        if (audit instanceof CactusAudit a && a.userId() != null && !a.userId().isBlank()) return a.userId();
        return "system";
    }

    public static String format(LocalDateTime t) {
        return t == null ? null : DATE_TIME.format(t);
    }

    public static String toJson(Object v) {
        try {
            return JSON.writeValueAsString(v);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("JSON 쓰기 실패", e);
        }
    }

    public static Map<String, Object> readMap(String text) {
        if (text == null || text.isBlank()) return new LinkedHashMap<>();
        try {
            return JSON.readValue(text, new TypeReference<LinkedHashMap<String, Object>>() {});
        } catch (JsonProcessingException e) {
            throw invalid("JSON 형식이 올바르지 않습니다");
        }
    }

    public static List<Map<String, Object>> readList(String text, String label) {
        if (text == null || text.isBlank()) return new java.util.ArrayList<>();
        try {
            return JSON.readValue(text, new TypeReference<List<Map<String, Object>>>() {});
        } catch (JsonProcessingException e) {
            throw invalid(label + " 형식이 올바르지 않습니다(JSON 배열)");
        }
    }

    /** 주문 JSON(항목 → 값) → 글 맵. 숫자도 글로 바꾼다. */
    public static Map<String, String> readOrder(String text) {
        Map<String, String> out = new LinkedHashMap<>();
        readMap(text).forEach((k, v) -> out.put(k, v == null ? null : String.valueOf(v)));
        return out;
    }

    public static BusinessException business(String message) {
        return new BusinessException(ErrorCode.BUSINESS_ERROR, message);
    }

    public static BusinessException invalid(String message) {
        return new BusinessException(ErrorCode.INVALID_VALUE, message);
    }

    public static String trimToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }

    public static String required(String v, String label) {
        if (v == null || v.isBlank()) throw new BusinessException(ErrorCode.REQUIRED_VALUE, label + "을(를) 입력하세요.");
        return v.trim();
    }
}
