package com.dongkuk.dmes.mdm.dme.ruleEdit.service;

import com.dongkuk.dmes.mdm.common.rule.RuleUsageFinder;
import com.dongkuk.dmes.mdm.dme.ruleEdit.dto.RuleEditViewResult.SetInfo;
import com.dongkuk.dmes.mdm.dme.ruleEdit.dto.RuleEditViewResult.UsageInfo;
import com.dongkuk.dmes.mdm.entity.MdmRule;
import com.dongkuk.dmes.mdm.repository.MdmRuleRepository;
import java.math.BigDecimal;
import java.util.List;
import org.springframework.stereotype.Service;

/** 카드 ⑧ 활용처 — 활용처 메모와 이 룰을 담은 룰 세트의 의존·역의존 룰(TSK-08-02 design §6.3.9, {@link RuleUsageFinder} 위임). */
@Service
public class RuleUsageService {

    private final RuleUsageFinder finder;
    private final MdmRuleRepository ruleRepository;

    public RuleUsageService(RuleUsageFinder finder, MdmRuleRepository ruleRepository) {
        this.finder = finder;
        this.ruleRepository = ruleRepository;
    }

    /** @param selectedVer view 의 선택 버전 — 이 룰에 RELEASED 가 없을 때만 쓴다 */
    public UsageInfo usage(String ruleId, BigDecimal selectedVer) {
        String note = ruleRepository.findById(ruleId).map(MdmRule::getUsageNote).orElse(null);
        List<SetInfo> sets = finder.find(ruleId, selectedVer).stream()
                .map(s -> new SetInfo(s.setId(), s.setName(), s.status(), s.dependsOn(), s.dependedBy()))
                .toList();
        return new UsageInfo(note, sets);
    }
}
