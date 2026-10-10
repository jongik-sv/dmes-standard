package com.dongkuk.dmes.mcm.widget.query;

import java.util.List;
import java.util.Locale;

/**
 * 쿼리 위젯 「입력 조건」 정의 하나 — CONFIG_JSON 의 {@code params[]} 원소(스펙 2026-10-02-widget-admin-generic 입력 조건,
 * 2026-10-10-custom-report-v2-design §2.1). 파싱·검사는 {@link QueryParams#parse}, 값 해석은 {@link QueryParams#resolve} 가 맡는다.
 *
 * @param name         SQL 의 {@code :name} 바인드 이름({@code ^[A-Za-z][A-Za-z0-9_]{0,29}$}, 시스템 변수와 다름)
 * @param label        화면 표시 이름(없으면 null)
 * @param type         값 형
 * @param defaultValue 기본값(없으면 null — 빈 글자도 없음으로 본다). date·daterange 는 상대 날짜 낱말도 받고, multi 는 쉼표로 나눈 글자
 * @param required     true 면 값도 기본값도 없을 때 실행을 거절한다
 * @param options      select·multi 의 고정 선택지(다른 형은 빈 목록)
 * @param codeGroup    select·multi 의 공통코드 그룹({@code TB_SEC_CODE_GROUP.GROUP_CD}, 없으면 null). options 와 함께 쓸 수 없다
 * @param toName       daterange 끝 날짜 바인드 이름(daterange 만)
 * @param toDefault    daterange 끝 기본값
 * @param maxSpanDays  daterange 최대 일수(1~3660, 없으면 null)
 * @param countName    multi 의 고른 개수 바인드 이름(없으면 null)
 */
public record QueryParam(String name, String label, Type type, String defaultValue, boolean required, List<Option> options,
                         String codeGroup, String toName, String toDefault, Integer maxSpanDays, String countName) {

    /** 1차 6인자 생성자 — 새 칸은 모두 비운다(기존 호출처·시험 호환). */
    public QueryParam(String name, String label, Type type, String defaultValue, boolean required, List<Option> options) {
        this(name, label, type, defaultValue, required, options, null, null, null, null, null);
    }

    /** 값 형 — 바인드 형이 갈린다(number=NUMERIC, 그 밖=VARCHAR). daterange 는 이름 두 개, multi 는 글자 목록. */
    public enum Type {
        TEXT, NUMBER, DATE, SELECT, DATERANGE, MULTI;

        /** JSON 의 소문자 이름({@code "text"} 등)에서 찾는다. 모르면 null. */
        static Type of(String json) {
            if (json == null) return null;
            for (Type t : values()) {
                if (t.name().toLowerCase(Locale.ROOT).equals(json)) return t;
            }
            return null;
        }
    }

    /** select·multi 선택지. */
    public record Option(String value, String label) {}

    /** 표시 이름 — 오류 문구용(label 이 없으면 name). */
    public String display() {
        return label == null || label.isBlank() ? name : label;
    }

    /** 이 조건이 SQL 에 노출하는 바인드 이름 전부(name + toName + countName) — SqlGuard 의 선언 이름 집합용. */
    public List<String> bindNames() {
        java.util.ArrayList<String> names = new java.util.ArrayList<>(3);
        names.add(name);
        if (toName != null) names.add(toName);
        if (countName != null) names.add(countName);
        return names;
    }
}
