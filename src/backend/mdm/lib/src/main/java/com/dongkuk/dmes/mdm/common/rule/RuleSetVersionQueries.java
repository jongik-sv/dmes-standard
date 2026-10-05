package com.dongkuk.dmes.mdm.common.rule;

import com.dongkuk.dmes.mdm.common.dictionary.DomainJson;
import com.dongkuk.dmes.mdm.common.version.VersionNumbers;
import com.dongkuk.dmes.mdm.entity.MdmRuleSetVer;
import jakarta.persistence.EntityManager;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import kr.dongkuk.maru.mdm.engine.flow.FlowParser;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.FlowDefinition;
import org.springframework.stereotype.Repository;

/**
 * 룰 세트 버전 읽기의 유일한 자리(D-144 2단계). 정렬·최대·같음은 Java 에서 한다 — SQLite 는 1.000 을 INTEGER, 1.001 을 REAL 로 둔다(규칙표 #17).
 * 원장을 고치는 쿼리는 두지 않는다(쓰기는 RuleSetWrites·공통 버전 엔진).
 */
@Repository
public class RuleSetVersionQueries {

    private static final Comparator<MdmRuleSetVer> VER_DESC = Comparator.comparing(MdmRuleSetVer::getVer).reversed();

    private final EntityManager entityManager;

    public RuleSetVersionQueries(EntityManager entityManager) {
        this.entityManager = entityManager;
    }

    /** 한 세트의 버전 전부, VER 내림차순. */
    public List<MdmRuleSetVer> versions(String setId) {
        List<MdmRuleSetVer> out = new ArrayList<>(entityManager.createQuery(
                        "SELECT v FROM MdmRuleSetVer v WHERE v.maruRuleSetId = :id", MdmRuleSetVer.class)
                .setParameter("id", setId).getResultList());
        out.sort(VER_DESC);
        return out;
    }

    /** 여러 세트의 버전을 한 문장으로. 키는 요청 순서, 값은 VER 내림차순, 버전 없는 세트는 빈 목록. */
    public Map<String, List<MdmRuleSetVer>> versionsOf(Collection<String> setIds) {
        Map<String, List<MdmRuleSetVer>> out = new LinkedHashMap<>();
        setIds.forEach(id -> out.put(id, new ArrayList<>()));
        if (setIds.isEmpty()) {
            return out;
        }
        for (MdmRuleSetVer v : entityManager.createQuery("SELECT v FROM MdmRuleSetVer v WHERE v.maruRuleSetId IN :ids", MdmRuleSetVer.class)
                .setParameter("ids", setIds).getResultList()) {
            out.get(v.getMaruRuleSetId()).add(v);
        }
        out.values().forEach(list -> list.sort(VER_DESC));
        return out;
    }

    /**
     * 이 세트를 부르는 RELEASED 행이 있을 수 있는가 — CALL_SET_IDS(서버가 쓰는 JSON 배열)에 따옴표로 감싼 세트 ID 가 든 행이 하나라도 있으면 true. 부르는 쪽
     * 원장 전체 읽기({@link SetCallIoReader#snapshot})를 건너뛸지 정하는 값싼 걸러내기다(한 문장, 한 행만). LIKE 의 {@code _} 는 다른 글자와도 맞아 거짓
     * 양성이 있을 수 있지만 그때는 전체 읽기가 정확히 가린다. false 면 이 세트를 부르는 행(Ruling 25 — 폐기 안 한 부모의 RELEASED 행)은 하나도 없다.
     */
    public boolean mayBeCalled(String setId) {
        return !entityManager.createQuery("SELECT v.maruRuleSetId FROM MdmRuleSetVer v WHERE v.status = 'RELEASED' AND v.callSetIds LIKE :p",
                        String.class)
                .setParameter("p", "%\"" + setId + "\"%").setMaxResults(1).getResultList().isEmpty();
    }

    public Optional<MdmRuleSetVer> find(String setId, BigDecimal ver) {
        return versions(setId).stream().filter(v -> VersionNumbers.same(v.getVer(), ver)).findFirst();
    }

    /** 표시 버전(J11) — 지금 적용 중인 RELEASED, 없으면 VER 최대. 버전이 없으면 빈 값. */
    public static Optional<MdmRuleSetVer> display(List<MdmRuleSetVer> versions, LocalDateTime now) {
        return RuleVersions.currentOrLatest(versions, now);
    }

    /**
     * 버전의 흐름 — FLOW_JSON 이 없으면 RULE_IDS 순서의 한 줄 흐름({@link FlowParser#linear}). 읽지 못하면 {@link IllegalArgumentException}(코덱).
     * 확정 검사·diff·세트 순서 검사가 함께 쓴다.
     */
    public static FlowDefinition flow(MdmRuleSetVer v) {
        return v.getFlowJson() == null ? FlowParser.linear(members(v)) : RuleSetFlowJson.parse(v.getFlowJson());
    }

    /** RULE_IDS → 룰 ID(저장 순서, 같은 ID 는 한 번). */
    public static List<String> members(MdmRuleSetVer v) {
        if (v.getRuleIds() == null || v.getRuleIds().isBlank()) {
            return List.of();
        }
        return List.copyOf(new LinkedHashSet<>(DomainJson.readList(v.getRuleIds()).stream().map(String::valueOf).toList()));
    }
}
