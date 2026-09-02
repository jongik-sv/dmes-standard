/*
 * 작성자: @junhwan-park
 * 작성일: 2026-06-01
 * 내용: SecMenu (TB_MCM_SEC_MENU) JPA Repository — commMenuMng 화면 owner (W2). 표준 CRUD + 복합 PK.
 */
package com.dongkuk.dmes.mcm.repository;

import com.dongkuk.dmes.mcm.entity.SecMenu;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * {@code MCMAPUSER.TB_MCM_SEC_MENU} JPA Repository — Spring Data 표준 CRUD (commMenuMng 화면 owner / W2).
 *
 * <p>Save / Delete / findById / existsById 표준만 제공. 복잡 native query (selectCommMenuMng /
 * selectMenuFldList CTE / selectMenuObj / selectMenuObjPop) 는 {@link SecMenuNativeRepository}
 * 의 별도 어댑터 클래스에서 처리 — 본 Repository 에 native @Query 부담 회피.
 *
 * <p>PK = MENU_ID 단독 (2026-06-05 사용자 결정 — 기존 복합 (MENU_ID, MENU_SEQ) 에서 변경).
 * MENU_SEQ 는 순수 순서 컬럼으로 분리. id type = {@code String} (MENU_ID).
 */
public interface SecMenuRepository extends JpaRepository<SecMenu, String> {
}
