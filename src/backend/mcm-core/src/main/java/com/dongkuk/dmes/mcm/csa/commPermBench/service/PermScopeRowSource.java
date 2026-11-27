/*
 * 작성자: perm-bench-be
 * 작성일: 2026-11-27
 * 내용: 범위 지문(D22)이 읽는 현재 행 이음매 — 범위 키별 정규 줄 목록
 */
package com.dongkuk.dmes.mcm.csa.commPermBench.service;

import java.util.Collection;
import java.util.List;
import java.util.Map;

/**
 * 범위 키({@code user:ID} · {@code group:ID} · {@code role:ID})마다 그 범위의 현재 DB 행을 정규 줄로 돌려준다.
 * 구현 = {@code repository.PermScopeRowRepository}(Oracle native), 시험 = 가짜.
 *
 * <p>줄 모양(지문이 이 모양에 기대므로 바꾸면 저장된 지문이 모두 어긋난다):
 * <ul>
 *   <li>{@code user:U} — 그 사람의 그룹 ID 한 줄씩(TB_MCM_SEC_USER_MAPPING)</li>
 *   <li>{@code group:G} — 그 그룹의 역할 ID 한 줄씩(TB_MCM_SEC_ROLEGROUP_MAPPING)</li>
 *   <li>{@code role:R} — 그 역할의 퍼미션 한 줄씩 {@code OBJECT_ID US BTN_PERM US POPUP_PERM US DATA_PERM}
 *       (US = U+001F, null = 빈 문자열, 값은 DB 에 저장된 글자 그대로)(TB_MCM_SEC_ROLE_PERM)</li>
 * </ul>
 * 줄 순서는 구현이 정하지 않아도 된다 — 지문 계산이 정렬한다. 행이 없는 범위도 키는 돌려준다(빈 목록).
 */
public interface PermScopeRowSource {

    /** 줄 안 칸 구분(Unit Separator). */
    char FIELD_SEP = '\u001F';

    Map<String, List<String>> rowsOf(Collection<String> scopeKeys);
}
