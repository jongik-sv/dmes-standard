package com.dongkuk.dmes.cactus.mastercode;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

/**
 * 마스터 코드 항목 LoV 조회 전용 Repository.
 *
 * <p>cactus-core 가 jar 의존성으로 제공 → 모든 소비 모듈 (mpn / mqc / mpp / mcm) 이
 * {@code @AutoConfiguration} + {@code @EnableJpaRepositories} 로 자동 활성화.
 * 다른 모듈은 별도 빈 등록 없이 본 Repository 를 그대로 주입받아 사용.
 *
 * <p><b>책임 분리:</b>
 * <ul>
 *   <li>cactus-core (본 Repository): <b>읽기 전용</b> LoV 조회 — 다른 모듈도 활용</li>
 *   <li>mcm-core ({@code SecCodeItemRepository}): <b>읽기·쓰기</b> CRUD — mcm 내부에서만 사용</li>
 * </ul>
 *
 * <p>다른 모듈이 mcm 의 Repository 를 의존하면 모듈화 이점이 깨지므로 cactus-core 가
 * 자체 Repository 를 보유. mcm 모듈은 단순히 CRUD 화면 책임자.
 */
public interface MasterCodeItemRepository extends JpaRepository<MasterCodeItemEntity, MasterCodeItemId> {

    /** 그룹 내 활성 항목을 SORT_ORD 순으로 조회. */
    @Query("SELECT i FROM MasterCodeItemEntity i " +
           "WHERE i.id.groupCd = :groupCd AND i.useYn = 'Y' " +
           "ORDER BY i.sortOrd ASC, i.id.itemCd ASC")
    List<MasterCodeItemEntity> findActiveByGroupCd(@Param("groupCd") String groupCd);

    /** 그룹 내 활성 항목 중 EXTRA_VAL1 일치 항목만. */
    @Query("SELECT i FROM MasterCodeItemEntity i " +
           "WHERE i.id.groupCd = :groupCd AND i.useYn = 'Y' " +
           "  AND i.extraVal1 = :extraVal1 " +
           "ORDER BY i.sortOrd ASC, i.id.itemCd ASC")
    List<MasterCodeItemEntity> findActiveByGroupCdAndExtraVal1(@Param("groupCd") String groupCd,
                                                                @Param("extraVal1") String extraVal1);
}
