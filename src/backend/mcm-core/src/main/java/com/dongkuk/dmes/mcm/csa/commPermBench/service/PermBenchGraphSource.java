/*
 * 작성자: perm-bench-be
 * 작성일: 2026-11-27
 * 내용: commPermBench 권한 기준(CUR|DRAFT) 해석·초안 변경 목록·설명 서비스·역할 범위 그래프 공급 — 아직 없는 빈은 호출 때 분명한 오류
 */
package com.dongkuk.dmes.mcm.csa.commPermBench.service;

import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import com.dongkuk.dmes.mcm.common.exception.ErrorCode;
import com.dongkuk.dmes.mcm.security.perm.PermChange;
import com.dongkuk.dmes.mcm.security.perm.PermExplainService;
import com.dongkuk.dmes.mcm.security.perm.PermGraph;
import com.dongkuk.dmes.mcm.security.perm.PermGraphLoader;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * 작업대 1단계 조회가 쓰는 권한 원천.
 *
 * <ul>
 *   <li>{@link #draftChanges(Source)} — CUR 이면 빈 목록, DRAFT 면 저장된 초안 변경 목록({@link PermBenchDraftReader}, b2).
 *       {@link PermExplainService} 는 빈 목록을 CUR 로 본다</li>
 *   <li>{@link #explainer()} — 설명·메뉴 트리(r4). 그래프 고르기(CUR = 사람/역할 범위, DRAFT = 전체 + 초안)는 그쪽이 맡는다</li>
 *   <li>{@link #forRole(String, Source)} — 역할×오브젝트 퍼미션 표(searchRolePerm)용 그래프.
 *       CUR = {@code loadForRoles}, DRAFT = {@code loadAll().applyChanges}(영향 계산은 이걸 쓰지 않는다 — 늘 loadAll)</li>
 * </ul>
 *
 * <p>빈 연결: 세 빈 모두 {@link ObjectProvider} 로 받아 빈이 없어도 앱이 뜬다. 쓰는 순간 없으면
 * {@link BusinessException}(메시지 {@code CODE: 상세}, Q-013). 같은 형이 둘 이상이면 Spring 오류가 그대로 난다.
 * 초안 이음매 확인은 그래프를 읽기 전에 한다.
 */
@Component
public class PermBenchGraphSource {

    /** 권한 기준. */
    public enum Source { CUR, DRAFT }

    static final String NOT_READY = "PERM_NOT_READY";
    static final String DRAFT_NOT_READY = "PERM_DRAFT_NOT_READY";
    static final String BAD_SOURCE = "PERM_BAD_SOURCE";

    private final ObjectProvider<PermGraphLoader> loaders;
    private final ObjectProvider<PermBenchDraftReader> draftReaders;
    private final ObjectProvider<PermExplainService> explainers;

    public PermBenchGraphSource(ObjectProvider<PermGraphLoader> loaders,
                                ObjectProvider<PermBenchDraftReader> draftReaders,
                                ObjectProvider<PermExplainService> explainers) {
        this.loaders = loaders;
        this.draftReaders = draftReaders;
        this.explainers = explainers;
    }

    /** 요청 source 해석. 비면 CUR, CUR·DRAFT 밖은 {@code PERM_BAD_SOURCE}. 대소문자는 구분하지 않는다. */
    public static Source parseSource(String source) {
        if (source == null || source.isBlank()) {
            return Source.CUR;
        }
        String s = source.trim().toUpperCase(Locale.ROOT);
        if ("CUR".equals(s)) {
            return Source.CUR;
        }
        if ("DRAFT".equals(s)) {
            return Source.DRAFT;
        }
        throw new BusinessException(ErrorCode.INVALID_VALUE, BAD_SOURCE + ": source 는 CUR 또는 DRAFT 입니다 (" + source + ")");
    }

    /** 설명 서비스(r4). 빈이 없으면 {@code PERM_NOT_READY}. */
    public PermExplainService explainer() {
        PermExplainService e = explainers.getIfAvailable();
        if (e == null) {
            throw new BusinessException(ErrorCode.SERVICE_EXECUTION_ERROR,
                    NOT_READY + ": 권한 설명 서비스(PermExplainService)가 아직 등록되지 않았습니다");
        }
        return e;
    }

    /** CUR 이면 빈 목록. DRAFT 면 초안 이음매 빈을 확인하고(없으면 {@code PERM_DRAFT_NOT_READY}) 저장된 변경을 읽는다. */
    public List<PermChange> draftChanges(Source source) {
        if (source != Source.DRAFT) {
            return List.of();
        }
        PermBenchDraftReader reader = draftReaders.getIfAvailable();
        if (reader == null) {
            throw new BusinessException(ErrorCode.SERVICE_EXECUTION_ERROR,
                    DRAFT_NOT_READY + ": 초안 조회(source=DRAFT)가 아직 준비되지 않았습니다. source=CUR 로 조회하세요");
        }
        List<PermChange> changes = reader.savedChanges();
        return changes == null ? List.of() : changes;
    }

    /**
     * 역할 하나 기준 그래프(퍼미션 표용). 저장된 변경이 없으면(CUR 포함) {@code loadForRoles({roleId})},
     * 있으면 {@code loadAll().applyChanges(초안)}. 어느 쪽이든 objects·menus 는 전부 담긴다(r2 계약).
     */
    public PermGraph forRole(String roleId, Source source) {
        List<PermChange> changes = draftChanges(source);
        if (changes.isEmpty()) {
            return loader().loadForRoles(Set.of(roleId));
        }
        return loader().loadAll().applyChanges(changes);
    }

    private PermGraphLoader loader() {
        PermGraphLoader l = loaders.getIfAvailable();
        if (l == null) {
            throw new BusinessException(ErrorCode.SERVICE_EXECUTION_ERROR,
                    NOT_READY + ": 권한 그래프 로더(PermGraphLoader)가 아직 등록되지 않았습니다");
        }
        return l;
    }
}
