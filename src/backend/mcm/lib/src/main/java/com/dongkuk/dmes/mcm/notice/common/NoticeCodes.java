/*
 * 작성자: Agent
 * 작성일: 2026-10-02
 * 내용: 공지(TB_MLS_NOTICE) 코드값 상수 — noticeMgmt·noticeBoard 공용 (기능설계서 §10 LV-001~LV-003)
 */
package com.dongkuk.dmes.mls.lsh.common;

import java.util.Set;

/**
 * 공지 코드값 도메인 (기능설계서 §10). 코드 마스터에 등재하지 않은 화면 인라인 상수다.
 *
 * <p>FE 의 콤보·뱃지가 같은 문자열을 쓰므로 값을 바꾸면 FE({@code m-mls/pages/lsh/noticeMgmt/types.ts})와 함께 바꾼다.
 */
public final class NoticeCodes {

    private NoticeCodes() {
    }

    // ── LV-001 게시상태 ─────────────────────────────────────────────
    public static final String STATUS_DRAFT = "DRAFT";
    public static final String STATUS_POSTED = "POSTED";
    public static final String STATUS_STOPPED = "STOPPED";
    public static final Set<String> STATUS_DOMAIN = Set.of(STATUS_DRAFT, STATUS_POSTED, STATUS_STOPPED);

    // ── LV-002 본문 형식 ────────────────────────────────────────────
    public static final String FORMAT_TEXT = "TEXT";
    public static final String FORMAT_MD = "MD";
    public static final String FORMAT_HTML = "HTML";
    public static final Set<String> FORMAT_DOMAIN = Set.of(FORMAT_TEXT, FORMAT_MD, FORMAT_HTML);

    // ── LV-003 공지 분류 ────────────────────────────────────────────
    public static final String CATEGORY_NORMAL = "NORMAL";
    public static final String CATEGORY_MAINT = "MAINT";
    public static final String CATEGORY_URGENT = "URGENT";
    public static final Set<String> CATEGORY_DOMAIN = Set.of(CATEGORY_NORMAL, CATEGORY_MAINT, CATEGORY_URGENT);

    // ── LV-004 게시 대상 범위 (V4) ───────────────────────────────────
    public static final String SCOPE_ALL = "ALL";
    public static final String SCOPE_ROLE = "ROLE";
    public static final Set<String> SCOPE_DOMAIN = Set.of(SCOPE_ALL, SCOPE_ROLE);

    // ── 상단 고정 ──────────────────────────────────────────────────
    public static final String YES = "Y";
    public static final String NO = "N";
    public static final Set<String> YN_DOMAIN = Set.of(YES, NO);
}
