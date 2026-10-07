package com.dongkuk.dmes.mcm.init.seed;

import com.dongkuk.dmes.mcm.repository.SecMenuNativeRepository;

/**
 * 메뉴 시드 마무리 — 모듈 루트 폴더 순서 보정과 FULL_SEQ 7자리 재계산 (2026-10-04 DataInitializer 분할).
 *
 * <p>모든 메뉴 INSERT 뒤에, {@link #fixModuleRootMenuSeqOrder()} → {@link #recomputeMenuFullSeq()} 순서로 부른다.
 */
public final class MenuFinalizer extends SeedSupport {

    private final SecMenuNativeRepository secMenuNativeRepository;

    public MenuFinalizer(SeedSupport support, SecMenuNativeRepository secMenuNativeRepository) {
        super(support);
        this.secMenuNativeRepository = secMenuNativeRepository;
    }

    /** mcm-core {@link SecMenuNativeRepository#recomputeMenuFullSeq()} 위임 — 반드시 메뉴 시드의 마지막 호출이다. */
    public void recomputeMenuFullSeq() {
        secMenuNativeRepository.recomputeMenuFullSeq();
    }

    /**
     * 모듈 루트 폴더(mpn 공정계획 / mcm 공통관리) 표시 순서를 기동 시 멱등 고정.
     *
     * <p>폴더 정렬은 MENU_SEQ asc 기준(2026-06-10, {@code recomputeMenuFullSeq}). 그러나 seedMcmSecMenuFld /
     * seedMpnMenus 는 {@code insertIfAbsent} 라 기존 행의 MENU_SEQ 를 갱신하지 않아, 시드 리터럴 변경
     * (b1eac364: mpn 2→1, mcm 1→2)이 이미 시드된 DB(dev MSSQL · 동료 SQLite)에는 반영되지 않는다.
     *
     * <p>모듈 루트 순서는 제품 고정 정책이므로 루트 2행만 강제 정정한다. 그룹/화면 순서(사용자 편집)는
     * 건드리지 않는다. 값이 이미 맞으면 UPDATE 영향 0 (멱등 · 신규 클린 DB 무영향). 본 메서드 직후
     * {@code recomputeMenuFullSeq()} 가 정정된 MENU_SEQ 기준으로 FULL_SEQ 를 재부여한다.
     *
     */
    public void fixModuleRootMenuSeqOrder() {
        int n = 0;
        n += nq("UPDATE MCMAPUSER.TB_MCM_SEC_MENU_FLD SET MENU_SEQ = '00000001' " +
                "WHERE MENU_ID = 'mpn' AND (MENU_SEQ IS NULL OR MENU_SEQ <> '00000001')").executeUpdate();
        n += nq("UPDATE MCMAPUSER.TB_MCM_SEC_MENU_FLD SET MENU_SEQ = '00000002' " +
                "WHERE MENU_ID = 'mcm' AND (MENU_SEQ IS NULL OR MENU_SEQ <> '00000002')").executeUpdate();
        if (n > 0) {
            log.info("[DataInitializer] 모듈 루트 순서 보정 — 공정계획(mpn=00000001)/공통관리(mcm=00000002) MENU_SEQ {}행 갱신.", n);
        }
    }
}
