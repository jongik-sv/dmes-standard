package com.dongkuk.dmes.mcm.init.seed;

import com.dongkuk.dmes.mcm.repository.SecMenuNativeRepository;

/**
 * 메뉴 시드 마무리 — 모듈 루트 폴더 순서 보정과 OBJECT 화면 코드 경로 채우기 (2026-10-04 DataInitializer 분할).
 *
 * <p>모든 메뉴 INSERT 뒤에, {@link #fixModuleRootMenuSeqOrder()} → {@link #backfillObjectFormUrl()} 순서로 부른다.
 * 2026-11-27 — FULL_SEQ 재계산 단계는 컬럼과 함께 없앴다. 메뉴 순서는 같은 부모 안의 MENU_SEQ 로만 정한다.
 */
public final class MenuFinalizer extends SeedSupport {

    private final SecMenuNativeRepository secMenuNativeRepository;

    public MenuFinalizer(SeedSupport support, SecMenuNativeRepository secMenuNativeRepository) {
        super(support);
        this.secMenuNativeRepository = secMenuNativeRepository;
    }

    /**
     * OBJECT 화면 코드 경로(FORM_URL) 채우기 — mcm-core {@link SecMenuNativeRepository#backfillObjectFormUrl()} 위임 (2026-11-26).
     *
     * <p>시드는 OBJECT 를 FORM_URL 없이 넣는다({@code insertMcmSecObjIfAbsent}). Flyway({@code V22__backfill_obj_form_url})는
     * 시드보다 먼저 돌아 새 DB 에서는 채울 행이 없으므로, 시드 끝에 같은 문장을 한 번 더 돌린다. 멱등이다 — 이미 경로가 있는
     * OBJECT 는 건드리지 않아 두 번째 기동부터는 0행이다(운영 중 화면에서 바꾼 FORM_URL 도 보존).
     */
    public void backfillObjectFormUrl() {
        int n = secMenuNativeRepository.backfillObjectFormUrl();
        if (n > 0) {
            log.info("[DataInitializer] OBJECT FORM_URL(화면 코드 경로) {}행을 PARENT_MENU_ID/OBJECT_ID 로 채움.", n);
        }
    }

    /**
     * 모듈 루트 폴더(mpn 공정계획 / mcm 공통관리) 표시 순서를 기동 시 멱등 고정.
     *
     * <p>폴더 정렬은 같은 부모 안의 MENU_SEQ asc 기준이다(2026-06-10). 그러나 seedMcmSecMenuFld /
     * seedMpnMenus 는 {@code insertIfAbsent} 라 기존 행의 MENU_SEQ 를 갱신하지 않아, 시드 리터럴 변경
     * (b1eac364: mpn 2→1, mcm 1→2)이 이미 시드된 DB(개발계·다른 개발자 로컬 DB)에는 반영되지 않는다.
     *
     * <p>모듈 루트 순서는 제품 고정 정책이므로 루트 2행만 강제 정정한다. 그룹/화면 순서(사용자 편집)는
     * 건드리지 않는다. 값이 이미 맞으면 UPDATE 영향 0 (멱등 · 신규 클린 DB 무영향).
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
