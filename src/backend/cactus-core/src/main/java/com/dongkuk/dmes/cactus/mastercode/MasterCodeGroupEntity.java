package com.dongkuk.dmes.cactus.mastercode;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * 마스터 코드 그룹 (TB_SEC_CODE_GROUP) — cactus-core 측 read-only 매핑.
 *
 * <p>본 Entity 는 <b>다른 모듈이 LoV 조회용으로 활용</b>한다 (mpn / mqc / mpp / mcm 등).
 * cactus-core 가 JPA Entity + Repository 를 제공하므로 소비 모듈은 cactus-core
 * 의존성만으로 자동 활성화 (별도 코드 0줄). mcm 의 CRUD 책임과 격리 — 다른 모듈은
 * mcm 의 API/Service/Mapper 를 호출하지 않는다.
 *
 * <p>mcm-core 측 {@code SecCodeGroup} Entity (CRUD 용) 와 같은 테이블을 매핑하지만
 * 클래스는 별도. JPA 는 같은 테이블 다중 Entity 매핑 허용. 두 entity 가 같은
 * EntityManager 안에서 공존 가능.
 */
@Entity
@Table(name = "TB_SEC_CODE_GROUP")
public class MasterCodeGroupEntity {

    @Id
    @Column(name = "GROUP_CD", length = 50)
    private String groupCd;

    @Column(name = "GROUP_NM", length = 200)
    private String groupNm;

    @Column(name = "GROUP_DESC", length = 500)
    private String groupDesc;

    @Column(name = "USE_YN", length = 1)
    private String useYn;

    protected MasterCodeGroupEntity() {}

    public String getGroupCd() { return groupCd; }
    public String getGroupNm() { return groupNm; }
    public String getGroupDesc() { return groupDesc; }
    public String getUseYn() { return useYn; }
}
