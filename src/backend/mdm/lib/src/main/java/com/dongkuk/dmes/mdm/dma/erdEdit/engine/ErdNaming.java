package com.dongkuk.dmes.mdm.dma.erdEdit.engine;

import com.dongkuk.dmes.mdm.dma.erdEdit.model.ErdModel;
import com.dongkuk.dmes.mdm.dma.naming.NameComposition;
import java.util.List;
import java.util.Optional;

/** 엔진이 쓰는 사전 판정(Task 6 의 ErdDictionary 가 구현). 엔진은 DB 를 모른다. */
public interface ErdNaming {

    /** 논리명 → 물리명 분해. 사전이 없으면 empty. */
    Optional<NameComposition> forward(String logical);

    Optional<ErdDomainSpec> domain(Long domainId);

    Optional<ErdDomainSpec> recommendDomain(String physName);

    /** 바뀐 컬럼의 표준 경고(모델 전체를 보고 타입 불일치까지 판정). */
    List<ErdWarning> warnings(ErdModel model, List<String> columnIds);

    /** 물리명으로 채우는 논리명·도메인(컬럼 사전 → 별칭 → 역분해). 사전이 없으면 (null, null). */
    record PhysFill(String logical, Long domainId) {}

    default PhysFill fillByPhys(String phys) { return new PhysFill(null, null); }

    ErdNaming NONE = new ErdNaming() {
        public Optional<NameComposition> forward(String logical) { return Optional.empty(); }
        public Optional<ErdDomainSpec> domain(Long domainId) { return Optional.empty(); }
        public Optional<ErdDomainSpec> recommendDomain(String physName) { return Optional.empty(); }
        public List<ErdWarning> warnings(ErdModel model, List<String> columnIds) { return List.of(); }
    };
}
