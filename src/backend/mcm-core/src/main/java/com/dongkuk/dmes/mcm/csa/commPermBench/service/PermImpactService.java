/*
 * 작성자: perm-bench-be
 * 작성일: 2026-11-27
 * 내용: commPermBench impact action — 저장된 초안을 적용했을 때의 영향(summary·impacts 앞 500줄)
 */
package com.dongkuk.dmes.mcm.csa.commPermBench.service;

import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import com.dongkuk.dmes.mcm.common.exception.ErrorCode;
import com.dongkuk.dmes.mcm.csa.commPermBench.dto.PermBenchImpactsRow;
import com.dongkuk.dmes.mcm.csa.commPermBench.dto.PermBenchSummaryRow;
import com.dongkuk.dmes.mcm.security.perm.ImpactCalculator;
import com.dongkuk.dmes.mcm.security.perm.PermChange;
import com.dongkuk.dmes.mcm.security.perm.PermGraph;
import com.dongkuk.dmes.mcm.security.perm.PermGraphLoader;
import com.dongkuk.dmes.mcm.security.perm.PermResolver;
import com.dongkuk.dmes.mcm.security.perm.UserImpact;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * impact action. 응답 = {@code Map} 키 {@code summary}(한 줄)·{@code impacts}(앞 {@value #MAX_ROWS} 줄), BPMN output="result".
 *
 * <p>그래프는 {@code loadAll()} 한 번만 읽는다. 후보 사용자(변경된 그룹·역할을 가진 사람)를 알려면 먼저 사용자→그룹→역할 연결
 * 전체를 봐야 하는데, {@code loadForUsers} 는 후보를 알아야 부를 수 있어 결국 전체를 한 번 읽고 다시 좁혀 읽게 된다(두 번 조회).
 * 오브젝트·메뉴는 어차피 전체이므로 loadAll 한 번이 더 싸다. 대신 비교(diff·visibleObjects)는 후보 사용자만 남긴
 * 그래프로 한다({@link PermImpactCalculator}).
 *
 * <p>구성 요소 빈(PermGraphLoader·PermResolver·ImpactCalculator)은 아직 없을 수 있어 {@link ObjectProvider} 로 받고,
 * 쓰는 순간 없으면 {@code PERM_NOT_READY: …}.
 */
@Service
public class PermImpactService {

    /** impacts 최대 줄 수. */
    public static final int MAX_ROWS = 500;

    private final PermDraftService draft;
    private final ObjectProvider<PermGraphLoader> loaders;
    private final ObjectProvider<PermResolver> resolvers;
    private final ObjectProvider<ImpactCalculator> calculators;
    private final PermImpactNames names;

    public PermImpactService(PermDraftService draft, ObjectProvider<PermGraphLoader> loaders,
                             ObjectProvider<PermResolver> resolvers, ObjectProvider<ImpactCalculator> calculators,
                             PermImpactNames names) {
        this.draft = draft;
        this.loaders = loaders;
        this.resolvers = resolvers;
        this.calculators = calculators;
        this.names = names;
    }

    /** 내 저장 초안의 영향. 초안이 없거나 비어 있으면 summary 0, impacts 빈 목록. */
    public Map<String, Object> impact() {
        List<PermChange> changes = draft.myChanges();
        if (changes.isEmpty()) {
            return grids(PermImpactCalculator.Result.empty(), names);
        }
        PermGraph before = require(loaders, "권한 그래프 로더(PermGraphLoader)").loadAll();
        PermImpactCalculator.Result r = new PermImpactCalculator(
                require(resolvers, "권한 계산기(PermResolver)"), require(calculators, "영향 계산기(ImpactCalculator)"))
                .compute(before, changes, MAX_ROWS);
        return grids(r, names);
    }

    /** 결과를 응답 grid 로. 이름은 보여줄 앞 줄의 사용자·오브젝트만 조회한다. */
    static Map<String, Object> grids(PermImpactCalculator.Result r, PermImpactNames names) {
        List<UserImpact> shown = r.impacts().size() > MAX_ROWS ? r.impacts().subList(0, MAX_ROWS) : r.impacts();
        Set<String> userIds = new LinkedHashSet<>();
        Set<String> objectIds = new LinkedHashSet<>();
        for (UserImpact u : shown) {
            userIds.add(u.userId());
            objectIds.add(u.objectId());
        }
        Map<String, String> userNm = userIds.isEmpty() ? Map.of() : names.userNames(userIds);
        Map<String, String> objNm = objectIds.isEmpty() ? Map.of() : names.objectNames(objectIds);

        List<Map<String, Object>> rows = new ArrayList<>(shown.size());
        for (UserImpact u : shown) {
            rows.add(new PermBenchImpactsRow(u.userId(), userNm.get(u.userId()), u.objectId(), objNm.get(u.objectId()),
                    PermImpactCalculator.codes(u.gained()), PermImpactCalculator.codes(u.lost())).toRow());
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("summary", List.of(new PermBenchSummaryRow(r.gainUserCnt(), r.loseUserCnt(), r.screenCnt()).toRow()));
        out.put("impacts", rows);
        return out;
    }

    private static <T> T require(ObjectProvider<T> p, String what) {
        T t = p.getIfAvailable();
        if (t == null) {
            throw new BusinessException(ErrorCode.SERVICE_EXECUTION_ERROR,
                    PermBenchGraphSource.NOT_READY + ": " + what + "가 아직 등록되지 않았습니다");
        }
        return t;
    }
}
