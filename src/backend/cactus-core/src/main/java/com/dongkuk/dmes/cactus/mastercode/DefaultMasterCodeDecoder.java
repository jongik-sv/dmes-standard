package com.dongkuk.dmes.cactus.mastercode;

import java.util.List;

/**
 * {@link MasterCodeItemRepository} 기반 기본 디코더.
 * {@link MasterCodeMybatisAutoConfiguration} 에서 {@code @ConditionalOnMissingBean} 으로 등록.
 *
 * <p>현재 구현은 cache 없이 매 호출마다 Repository 를 조회한다. LoV 캐시가 필요하면
 * {@code MasterCodeCacheAutoConfiguration} (cactus 기존) 의 캐시를 활용하거나 본 클래스에
 * {@code @Cacheable} 을 추가하는 방식. Phase 6 파일럿에서 호출 빈도 점검 후 결정.
 */
public class DefaultMasterCodeDecoder implements MasterCodeDecoder {

    private final MasterCodeItemRepository repository;

    public DefaultMasterCodeDecoder(MasterCodeItemRepository repository) {
        this.repository = repository;
    }

    @Override
    public String decode(String value, String groupCd) {
        if (value == null || groupCd == null) {
            return null;
        }
        return repository.findById(new MasterCodeItemId(groupCd, value))
                .map(MasterCodeItemEntity::getItemNm)
                .orElse(null);
    }

    @Override
    public boolean isMasterCode(String groupCd) {
        if (groupCd == null || groupCd.isEmpty()) {
            return false;
        }
        // 그룹에 활성 항목이 하나라도 있으면 알려진 마스터 코드로 간주
        List<MasterCodeItemEntity> items = repository.findActiveByGroupCd(groupCd);
        return !items.isEmpty();
    }
}
