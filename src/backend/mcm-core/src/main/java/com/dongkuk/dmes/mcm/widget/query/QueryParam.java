package com.dongkuk.dmes.mcm.widget.query;

import java.util.List;
import java.util.Locale;

/**
 * 쿼리 위젯 「입력 조건」 정의 하나 — CONFIG_JSON 의 {@code params[]} 원소(스펙 2026-10-02-widget-admin-generic 입력 조건).
 * 파싱·검사는 {@link QueryParams#parse}, 값 해석은 {@link QueryParams#resolve} 가 맡는다.
 *
 * @param name         SQL 의 {@code :name} 바인드 이름({@code ^[A-Za-z][A-Za-z0-9_]{0,29}$}, 시스템 변수와 다름)
 * @param label        화면 표시 이름(없으면 null)
 * @param type         값 형
 * @param defaultValue 기본값(없으면 null — 빈 글자도 없음으로 본다)
 * @param required     true 면 값도 기본값도 없을 때 실행을 거절한다
 * @param options      select 형의 선택지(다른 형은 빈 목록)
 */
public record QueryParam(String name, String label, Type type, String defaultValue, boolean required, List<Option> options) {

    /** 값 형 — 바인드 형이 갈린다(number=NUMERIC, 그 밖=VARCHAR). */
    public enum Type {
        TEXT, NUMBER, DATE, SELECT;

        /** JSON 의 소문자 이름({@code "text"} 등)에서 찾는다. 모르면 null. */
        static Type of(String json) {
            if (json == null) return null;
            for (Type t : values()) {
                if (t.name().toLowerCase(Locale.ROOT).equals(json)) return t;
            }
            return null;
        }
    }

    /** select 선택지. */
    public record Option(String value, String label) {}

    /** 표시 이름 — 오류 문구용(label 이 없으면 name). */
    public String display() {
        return label == null || label.isBlank() ? name : label;
    }
}
