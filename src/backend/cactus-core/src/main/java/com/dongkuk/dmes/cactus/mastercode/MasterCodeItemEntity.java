package com.dongkuk.dmes.cactus.mastercode;

import jakarta.persistence.Column;
import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

/**
 * 마스터 코드 항목 (TB_SEC_CODE_ITEM) — cactus-core 측 read-only 매핑.
 *
 * <p>{@link com.dongkuk.dmes.cactus.web.inbound.DefaultMasterCodeProvider} 가
 * {@link MasterCodeItemRepository} 를 통해 본 Entity 를 조회하여 LoV 응답 생성.
 *
 * <p>다른 모듈(mpn / mqc / mpp) 은 cactus-core 의존성만으로 자동 활성화.
 * mcm 의 CRUD 와 격리 — 모듈화 이점 유지.
 *
 * <p>같은 테이블을 mcm-core 의 {@code SecCodeItem} (CRUD 용) 도 매핑하지만 별도 클래스.
 */
@Entity
@Table(name = "TB_SEC_CODE_ITEM")
public class MasterCodeItemEntity {

    @EmbeddedId
    private MasterCodeItemId id;

    @Column(name = "ITEM_NM", length = 200)
    private String itemNm;

    @Column(name = "ITEM_DESC", length = 500)
    private String itemDesc;

    @Column(name = "SORT_ORD")
    private Integer sortOrd;

    @Column(name = "EXTRA_VAL1", length = 200)
    private String extraVal1;

    @Column(name = "EXTRA_VAL2", length = 200)
    private String extraVal2;

    @Column(name = "USE_YN", length = 1)
    private String useYn;

    protected MasterCodeItemEntity() {}

    public MasterCodeItemId getId() { return id; }
    public String getItemNm() { return itemNm; }
    public String getItemDesc() { return itemDesc; }
    public Integer getSortOrd() { return sortOrd; }
    public String getExtraVal1() { return extraVal1; }
    public String getExtraVal2() { return extraVal2; }
    public String getUseYn() { return useYn; }
}
