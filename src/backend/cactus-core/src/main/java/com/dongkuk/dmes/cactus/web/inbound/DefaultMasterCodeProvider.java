package com.dongkuk.dmes.cactus.web.inbound;

import com.dongkuk.dmes.cactus.mastercode.MasterCodeItemEntity;
import com.dongkuk.dmes.cactus.mastercode.MasterCodeItemRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.cache.annotation.Cacheable;

import java.util.Collections;
import java.util.List;

/**
 * {@link MasterCodeProvider} 의 기본 구현체 — JPA Repository 기반.
 *
 * <p>cactus-core 의 {@link MasterCodeItemRepository} 가 {@code TB_SEC_CODE_ITEM} 을
 * 조회하여 LoV 응답으로 변환한다. JdbcTemplate 의존 제거 — 순수 JPA.
 *
 * <p><b>책임 분리:</b>
 * <ul>
 *   <li><b>cactus-core (본 Provider + Repository)</b>: 다른 모듈이 활용하는 LoV 인프라.
 *       mpn / mqc / mpp / mcm 등 모든 소비 모듈이 cactus-core 의존성만으로 자동 활성화.</li>
 *   <li><b>mcm-core / mcm 모듈</b>: 마스터 코드 CRUD 화면. 자체 SecCodeGroup/Item Repository 보유.
 *       <b>다른 모듈은 mcm 의 API/Repository 를 호출하지 않음</b> (모듈화 격리).</li>
 * </ul>
 *
 * <p>같은 테이블({@code TB_SEC_CODE_ITEM}) 을 cactus-core 의 {@link MasterCodeItemEntity}
 * 와 mcm-core 의 {@code SecCodeItem} 이 별도로 매핑하지만 JPA 가 허용. Hibernate
 * EntityManager 가 두 매핑을 동시에 관리.
 *
 * <p>호출 경로:
 * <pre>
 * GET /lov/master/{code}              → group=null  → 그룹 전체 활성 항목
 * GET /lov/master/{code}/{group}      → group != null → EXTRA_VAL1 = group 필터
 * </pre>
 *
 * <p>{@code group} 이 "ROOT" 또는 비어있으면 필터 미적용.
 * 결과는 {@link MasterCodeCacheAutoConfiguration} 의 Caffeine 캐시(TTL 5분) 로 적재된다.
 */
public class DefaultMasterCodeProvider implements MasterCodeProvider {

    private static final Logger log = LoggerFactory.getLogger(DefaultMasterCodeProvider.class);

    private final MasterCodeItemRepository repository;

    public DefaultMasterCodeProvider(MasterCodeItemRepository repository) {
        this.repository = repository;
    }

    @Override
    @Cacheable(value = "mcmMasterCodeLov", key = "#code + ':' + (#group != null ? #group : '_')")
    public List<Lov> findMasterCodeLov(String code, String group) {
        if (code == null || code.isBlank()) {
            return Collections.emptyList();
        }

        boolean noFilter = (group == null || group.isBlank() || "ROOT".equalsIgnoreCase(group));

        List<MasterCodeItemEntity> entities = noFilter
                ? repository.findActiveByGroupCd(code)
                : repository.findActiveByGroupCdAndExtraVal1(code, group);

        List<Lov> rows = entities.stream()
                .map(e -> new Lov(e.getId().getGroupCd(), e.getId().getItemCd(), e.getItemNm()))
                .toList();

        log.debug("[mcm.lov.master] code={} group={} rows={}", code, group, rows.size());
        return rows;
    }
}
