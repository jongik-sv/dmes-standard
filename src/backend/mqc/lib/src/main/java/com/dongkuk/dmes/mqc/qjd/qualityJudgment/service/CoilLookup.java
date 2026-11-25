package com.dongkuk.dmes.mqc.qjd.qualityJudgment.service;

import com.dongkuk.dmes.mqc.qjd.qualityJudgment.domain.Coil;
import com.dongkuk.dmes.mqc.qjd.qualityJudgment.domain.CoilJudgment;
import com.dongkuk.dmes.mqc.qjd.qualityJudgment.domain.HeatChemistry;
import com.dongkuk.dmes.mqc.qjd.qualityJudgment.domain.InspectionItem;
import com.dongkuk.dmes.mqc.qjd.qualityJudgment.repository.CoilJudgmentRepository;
import com.dongkuk.dmes.mqc.qjd.qualityJudgment.repository.CoilRepository;
import com.dongkuk.dmes.mqc.qjd.qualityJudgment.repository.HeatChemistryRepository;
import com.dongkuk.dmes.mqc.qjd.qualityJudgment.repository.InspectionItemRepository;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.springframework.stereotype.Component;

/**
 * 코일·판정·검사 항목을 한꺼번에 읽는 조회 도우미. 출력물(보증서·증명서·Tag) 서비스가 코일 판정과 검사값을 볼 때 쓴다.
 * OASIS 진입점이 아니다(BPMN 이 부르지 않는다).
 */
@Component
public class CoilLookup {

    private final CoilRepository coils;
    private final CoilJudgmentRepository judgments;
    private final InspectionItemRepository items;
    private final HeatChemistryRepository chemistry;

    public CoilLookup(CoilRepository coils, CoilJudgmentRepository judgments, InspectionItemRepository items,
                      HeatChemistryRepository chemistry) {
        this.coils = coils;
        this.judgments = judgments;
        this.items = items;
        this.chemistry = chemistry;
    }

    /** 코일 번호 → 스냅숏. 없는 코일은 빠진다. 결과 순서는 입력 순서다. */
    public Map<String, CoilSnapshot> load(Collection<String> coilNos) {
        Map<String, CoilSnapshot> out = new LinkedHashMap<>();
        if (coilNos == null || coilNos.isEmpty()) return out;
        Map<String, Coil> coilMap = new HashMap<>();
        for (Coil c : coils.findAllById(coilNos)) coilMap.put(c.getCoilNo(), c);
        Map<String, CoilJudgment> jdgMap = new HashMap<>();
        for (CoilJudgment j : judgments.findAllById(coilNos)) jdgMap.put(j.getCoilNo(), j);
        Map<String, List<InspectionItem>> itemMap = new HashMap<>();
        for (InspectionItem i : items.findByCoilNoInOrderByCoilNoAscSeqAsc(coilNos)) {
            itemMap.computeIfAbsent(i.getCoilNo(), k -> new ArrayList<>()).add(i);
        }
        for (String no : coilNos) {
            Coil c = coilMap.get(no);
            if (c != null) out.put(no, new CoilSnapshot(c, jdgMap.get(no), itemMap.getOrDefault(no, List.of())));
        }
        return out;
    }

    public Optional<CoilSnapshot> one(String coilNo) {
        return Optional.ofNullable(load(List.of(coilNo)).get(coilNo));
    }

    /** 모든 코일(출력물 요청 칸의 고르기 목록용). 시연 데이터 규모라 한 번에 읽는다. */
    public List<CoilSnapshot> all() {
        List<Coil> list = coils.findAllByOrderByCoilNoAsc();
        Map<String, CoilJudgment> jdgMap = new HashMap<>();
        for (CoilJudgment j : judgments.findAll()) jdgMap.put(j.getCoilNo(), j);
        Map<String, List<InspectionItem>> itemMap = new HashMap<>();
        for (InspectionItem i : items.findAllByOrderByCoilNoAscSeqAsc()) {
            itemMap.computeIfAbsent(i.getCoilNo(), k -> new ArrayList<>()).add(i);
        }
        List<CoilSnapshot> out = new ArrayList<>();
        for (Coil c : list) out.add(new CoilSnapshot(c, jdgMap.get(c.getCoilNo()), itemMap.getOrDefault(c.getCoilNo(), List.of())));
        return out;
    }

    /** Heat 화학 성분(원소 · wt%). */
    public List<Map<String, Object>> chemistry(String heatNo) {
        List<Map<String, Object>> out = new ArrayList<>();
        if (heatNo == null) return out;
        for (HeatChemistry h : chemistry.findByHeatNoOrderBySeqAsc(heatNo)) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("elemCd", h.getElemCd());
            m.put("value", h.getContVal());
            out.add(m);
        }
        return out;
    }
}
