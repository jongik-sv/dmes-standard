package com.dongkuk.dmes.mcm.oracheck;

import com.dongkuk.dmes.mcm.repository.SecMenuNativeRepository;
import com.dongkuk.dmes.mcm.repository.SecRoleGroupMappingNativeRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.junit.jupiter.SpringJUnitConfig;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 메뉴 트리 SQL(oracle-1007 c2 가 Oracle 식으로 바꾼 재귀 WITH 3개와 상관 서브쿼리)을 실제 Oracle 에서 돌려 본다.
 *
 * <ul>
 *   <li>{@code SecMenuNativeRepository.searchCmMenu}·{@code searchMenuFld} — 칸 이름 목록을 단 재귀 WITH(ORA-32039 방지), LPAD 정렬 키</li>
 *   <li>{@code SecRoleGroupMappingNativeRepository.searchCmRoleGrpMenu} — 재귀 WITH + {@code T.LEV < 32} + LPAD 출력 + ROW_NUMBER</li>
 *   <li>{@code SecMenuNativeRepository.searchMenuObjPop} — 상관 서브쿼리 끝의 {@code FETCH FIRST 1 ROWS ONLY}</li>
 * </ul>
 *
 * <p>표는 기준선 V1(MCMAPUSER)의 것을 쓰고, 시험이 넣은 행은 각 시험 앞뒤에서 지운다(컨텍스트가 클래스 사이에 공유된다).
 */
@SpringJUnitConfig(OraCheckJpaConfig.class)
class MenuTreeSqlOraTest {

    @Autowired SecMenuNativeRepository menuRepo;
    @Autowired SecRoleGroupMappingNativeRepository roleGrpRepo;
    @Autowired JdbcTemplate jdbc;

    private static final List<String> TABLES = List.of(
            "TB_MCM_SEC_ROLE_PERM", "TB_MCM_SEC_MENU_FLD", "TB_MCM_SEC_MENU", "TB_MCM_SEC_OBJ",
            "TB_MCM_SEC_ROLEGROUP_MAPPING", "TB_MCM_SEC_ROLEGROUP", "TB_MCM_SEC_ROLE_MAPPING", "TB_MCM_SEC_ROLE");

    @BeforeEach
    @AfterEach
    void clean() {
        for (String t : TABLES) jdbc.update("DELETE FROM MCMAPUSER." + t);
    }

    // ───────────────────────── 픽스처 ─────────────────────────

    private void fld(String id, String seq, String parent) {
        jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_SEC_MENU_FLD (MENU_ID, MENU_SEQ, MENU_NM, PARENT_MENU_ID, USE_TP, MENU_VIEW_YN) "
                + "VALUES (?, ?, ?, ?, 'Y', 'Y')", id, seq, id + "-nm", parent);
    }

    private void menu(String id, String seq, String parent, String objectId, String useTp, String menuTp) {
        jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_SEC_MENU (MENU_ID, MENU_SEQ, MENU_NM, PARENT_MENU_ID, OBJECT_ID, USE_TP, MENU_TP, MENU_VIEW_YN) "
                + "VALUES (?, ?, ?, ?, ?, ?, ?, 'Y')", id, seq, id + "-nm", parent, objectId, useTp, menuTp);
    }

    private void obj(String id, String nm, String useTp) {
        jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_SEC_OBJ (OBJECT_ID, OBJECT_NM, SERVICE, FORM_URL, PARAM, USE_TP) VALUES (?, ?, 'svc', '/u', 'p', ?)",
                id, nm, useTp);
    }

    /** F_ROOT(1) ─ F_A(2) ─ F_A1(3) · F_ROOT ─ F_B(10) · F_ROOT2(2). 형제 순서 '2' < '10' 을 LPAD 가 지키는지 보려고 B 에 10 을 쓴다. */
    private void folderTree() {
        fld("F_ROOT", "1", null);
        fld("F_B", "10", "F_ROOT");
        fld("F_A", "2", "F_ROOT");
        fld("F_A1", "3", "F_A");
        fld("F_ROOT2", "2", null);
    }

    private static String s(Map<String, Object> row, String key) {
        Object v = row.get(key);
        return v == null ? null : v.toString();
    }

    private static int n(Map<String, Object> row, String key) {
        return ((Number) row.get(key)).intValue();
    }

    // ───────────────────────── searchMenuFld ─────────────────────────

    /** c2: searchMenuFld 의 재귀 WITH(칸 목록)·LPAD PATH·LEV 가 Oracle 에서 오류 없이 돌고 계층 순서로 나온다. */
    @Test
    @DisplayName("searchMenuFld — 재귀 WITH 가 돌고 PATH(LPAD 8자) 순서·LEV 0/1/2 로 나온다 (형제 '2' 가 '10' 보다 앞)")
    void searchMenuFld_hierarchyOrder() {
        folderTree();

        List<Map<String, Object>> rows = menuRepo.searchMenuFld();

        assertThat(rows).extracting(r -> s(r, "MENU_ID"))
                .containsExactly("F_ROOT", "F_A", "F_A1", "F_B", "F_ROOT2");
        assertThat(rows).extracting(r -> n(r, "LEV")).containsExactly(0, 1, 2, 1, 0);
        assertThat(rows.get(1)).containsEntry("PARENT_MENU_ID", "F_ROOT").containsEntry("MENU_SEQ", "2");
        assertThat(rows.get(0).get("PARENT_MENU_ID")).isNull();
    }

    /** 2026-11-27 FULL_SEQ 삭제 — 메뉴 필드 팝업 목록은 트리 순서(PATH)로 나오고, 부모를 못 찾은 폴더는 맨 뒤에 붙는다. */
    @Test
    @DisplayName("searchMenuFldList — 트리 순서(형제 '2' 가 '10' 보다 앞), 트리 밖 폴더는 맨 뒤")
    void searchMenuFldList_treeOrder() {
        folderTree();
        fld("F_ORPHAN", "1", "F_NONE");

        List<Map<String, Object>> rows = menuRepo.searchMenuFldList();

        assertThat(rows).extracting(r -> s(r, "MENU_ID"))
                .containsExactly("F_ROOT", "F_A", "F_A1", "F_B", "F_ROOT2", "F_ORPHAN");
        assertThat(rows.get(0)).doesNotContainKey("FULL_SEQ").containsEntry("MENU_VIEW_YN", "Y");
    }

    /** c2: 폴더가 하나도 없어도 재귀 WITH 가 빈 결과로 끝난다. */
    @Test
    @DisplayName("searchMenuFld — 폴더가 없으면 빈 목록")
    void searchMenuFld_empty() {
        assertThat(menuRepo.searchMenuFld()).isEmpty();
    }

    // ───────────────────────── searchCmMenu ─────────────────────────

    private void menusUnderTree() {
        folderTree();
        obj("OBJ_X", "object-x", "Y");
        menu("M_ROOT", "1", "F_ROOT", "OBJ_X", "Y", "WEB");
        menu("M_A1", "1", "F_A1", null, "Y", "WEB");
        menu("M_B", "1", "F_B", null, "N", "WEB");
        menu("M_OTHER", "1", "F_ROOT2", null, "Y", "WEB");
    }

    /** c2: searchCmMenu 의 WITH FldDesc (MENU_ID) 재귀가 폴더 후손의 화면만 모으고 다른 가지 화면은 뺀다. */
    @Test
    @DisplayName("searchCmMenu — 폴더 F_ROOT 지정: 후손 폴더(F_A1·F_B) 화면까지 MENU_ID 순으로, 다른 가지(F_ROOT2) 화면은 제외")
    void searchCmMenu_descendants() {
        menusUnderTree();

        List<Map<String, Object>> rows = menuRepo.searchCmMenu(null, "F_ROOT", null, null, null);

        assertThat(rows).extracting(r -> s(r, "MENU_ID")).containsExactly("M_A1", "M_B", "M_ROOT");
        Map<String, Object> root = rows.get(2);
        assertThat(root).containsEntry("OBJECT_ID", "OBJ_X").containsEntry("OBJECT_NM", "object-x").containsEntry("USE_TP", "Y");
    }

    /** c2: 하위 폴더만 지정하면 그 가지의 화면만 나온다(재귀 앵커). */
    @Test
    @DisplayName("searchCmMenu — 폴더 F_A 지정: F_A1 아래 화면만")
    void searchCmMenu_subFolder() {
        menusUnderTree();

        assertThat(menuRepo.searchCmMenu(null, "F_A", null, null, null))
                .extracting(r -> s(r, "MENU_ID")).containsExactly("M_A1");
    }

    /** c2: 폴더 미지정 분기(재귀 없음)와 || 결합 LIKE 조건(MENU_ID UPPER·MENU_NM·USE_TP). */
    @Test
    @DisplayName("searchCmMenu — 폴더 없이 전체 + || LIKE 조건(MENU_ID 대소문자 무시·MENU_NM·USE_TP)")
    void searchCmMenu_allAndFilters() {
        menusUnderTree();

        assertThat(menuRepo.searchCmMenu(null, null, null, null, null)).hasSize(4);
        assertThat(menuRepo.searchCmMenu("m_a", null, null, null, null))
                .extracting(r -> s(r, "MENU_ID")).containsExactly("M_A1");
        assertThat(menuRepo.searchCmMenu(null, null, "OTHER-n", null, null))
                .extracting(r -> s(r, "MENU_ID")).containsExactly("M_OTHER");
        assertThat(menuRepo.searchCmMenu(null, "F_ROOT", null, "N", null))
                .extracting(r -> s(r, "MENU_ID")).containsExactly("M_B");
    }

    // ───────────────────────── searchCmRoleGrpMenu ─────────────────────────

    /**
     * 역할그룹 RG1 → 역할 R1 → 개체 OBJ1 → 화면 메뉴 {@code menuId}. 이 SQL 의 앵커는 {@code TB_MCM_SEC_MENU_FLD.MENU_ID IN (역할이 가진
     * TB_MCM_SEC_MENU.MENU_ID)} 라서, 역할이 가진 화면 메뉴와 같은 ID 의 폴더 행이 있어야 트리가 시작된다(SQL 이 쓰인 그대로의 모양).
     */
    private void roleGroupWithMenu(String menuId, String roleGrpUse) {
        jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_SEC_ROLEGROUP (ROLE_GROUP_ID, ROLE_GROUP_NM, USE_TP) VALUES ('RG1', 'rg1', ?)", roleGrpUse);
        jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_SEC_ROLE (ROLE_ID, ROLE_NM, USE_TP) VALUES ('R1', 'r1', 'Y')");
        jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_SEC_ROLEGROUP_MAPPING (ROLE_GROUP_ID, ROLE_ID) VALUES ('RG1', 'R1')");
        obj("OBJ1", "obj1", "Y"); // ROLE_PERM FK(오브젝트) 부모
        jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_SEC_ROLE_PERM (ROLE_ID, OBJECT_ID, BTN_PERM) VALUES ('R1', 'OBJ1', 'READ')");
        menu(menuId, "1", null, "OBJ1", "Y", "WEB");
    }

    /** c2: searchCmRoleGrpMenu 의 MENU_TREE (…) 재귀가 부모 쪽으로 올라가며 LEV·LPAD 출력·ROW_NUMBER 를 낸다. */
    @Test
    @DisplayName("searchCmRoleGrpMenu — 재귀 WITH 가 위로 올라가 F_A1 → F_A → F_ROOT, LEV 0/1/2, MENU_SEQ 는 LPAD 8자, ROW_SEQ 1..3")
    void searchCmRoleGrpMenu_walksUp() {
        fld("F_ROOT", "1", null);
        fld("F_A", "2", "F_ROOT");
        fld("F_A1", "3", "F_A");
        obj("F_A1", "o", "Y"); // LEFT JOIN OBJ ON O.OBJECT_ID = M.MENU_ID
        roleGroupWithMenu("F_A1", "Y");

        List<Map<String, Object>> rows = roleGrpRepo.searchCmRoleGrpMenu("RG1");

        assertThat(rows).extracting(r -> s(r, "MENU_ID")).containsExactly("F_ROOT", "F_A", "F_A1");
        assertThat(rows).extracting(r -> n(r, "LEV")).containsExactly(2, 1, 0);
        assertThat(rows).extracting(r -> s(r, "MENU_SEQ")).containsExactly("00000001", "00000002", "00000003");
        assertThat(rows).extracting(r -> n(r, "ROW_SEQ")).containsExactly(1, 2, 3);
        assertThat(rows.get(2)).containsEntry("OBJECT_ID", "F_A1").containsEntry("MENU_VIEW_YN", "Y").containsEntry("PARENT_MENU_ID", "F_A");
        assertThat(rows.get(0).get("OBJECT_ID")).isNull();
    }

    /**
     * c2: 정렬 키 — ORDER BY·ROW_NUMBER 는 LPAD 별칭이 아니라 가공 전 M.MENU_SEQ(VARCHAR2 글자열)를 쓴다.
     * c4 판정: c2 이전 MSSQL 판도 {@code ORDER BY M.MENU_SEQ}(MENU_FLD.MENU_SEQ VARCHAR(30)) 글자 정렬이었으므로 동작 보존 — 길이가
     * 다른 값은 글자 순서('10' &lt; '2')로 나온다. 운영 자료는 저장 시 8자로 채우므로(CommMenuMngService LPAD 8) 글자 순서 = 숫자 순서다.
     */
    @Test
    @DisplayName("searchCmRoleGrpMenu — MENU_SEQ 가 '2'·'10' 처럼 길이가 다르면 가공 전 글자 순서('10' 이 '2' 보다 앞, MSSQL 판과 같음)")
    void searchCmRoleGrpMenu_paddedSeqOrder() {
        fld("F_ROOT", "10", null);
        fld("F_A", "2", "F_ROOT");
        fld("F_A1", "3", "F_A");
        roleGroupWithMenu("F_A1", "Y");

        List<Map<String, Object>> rows = roleGrpRepo.searchCmRoleGrpMenu("RG1");

        assertThat(rows).extracting(r -> s(r, "MENU_SEQ")).containsExactly("00000010", "00000002", "00000003");
    }

    /** c2: 재귀 쪽 {@code T.LEV < 32} 가 순환 자료(F_X↔F_Y)에서도 재귀를 멈춘다(예전 MAXRECURSION 32 대신). */
    @Test
    @DisplayName("searchCmRoleGrpMenu — 부모가 서로를 가리키는 순환 자료에서도 끝나고 LEV 는 32 를 넘지 않는다")
    void searchCmRoleGrpMenu_cycleTerminates() {
        fld("F_X", "1", "F_Y");
        fld("F_Y", "2", "F_X");
        roleGroupWithMenu("F_X", "Y");

        List<Map<String, Object>> rows = roleGrpRepo.searchCmRoleGrpMenu("RG1");

        assertThat(rows).extracting(r -> s(r, "MENU_ID")).contains("F_X", "F_Y");
        assertThat(rows).allSatisfy(r -> assertThat(n(r, "LEV")).isBetween(0, 32));
    }

    /** c2: 사용 안 함('N') 역할그룹·빈 역할그룹 ID 는 재귀가 시작하지 않아 빈 목록. */
    @Test
    @DisplayName("searchCmRoleGrpMenu — USE_TP='N' 역할그룹, null 역할그룹 ID 는 빈 목록")
    void searchCmRoleGrpMenu_excluded() {
        fld("F_X", "1", null);
        roleGroupWithMenu("F_X", "N");

        assertThat(roleGrpRepo.searchCmRoleGrpMenu("RG1")).isEmpty();
        assertThat(roleGrpRepo.searchCmRoleGrpMenu(null)).isEmpty();
    }

    // ───────────────────────── searchMenuObjPop ─────────────────────────

    /** c2: searchMenuObjPop 의 상관 서브쿼리 {@code FETCH FIRST 1 ROWS ONLY} — 개체 하나에 메뉴가 둘이어도 개체 행은 하나. */
    @Test
    @DisplayName("searchMenuObjPop — 메뉴 둘이 같은 개체를 가리켜도 한 행(부모는 둘 중 하나), 메뉴 없는 개체는 null, USE_TP='N' 개체는 제외")
    void searchMenuObjPop_fetchFirstSubquery() {
        obj("OBJ_B", "beta", "Y");
        obj("OBJ_A", "alpha", "Y");
        obj("OBJ_N", "disabled", "N");
        obj("OBJ_NONE", "no-menu", "Y");
        menu("M_1", "1", "F_P1", "OBJ_A", "Y", "WEB");
        menu("M_2", "1", "F_P2", "OBJ_A", "Y", "WEB");
        menu("M_3", "1", "F_P3", "OBJ_B", "Y", "WEB");

        List<Map<String, Object>> rows = menuRepo.searchMenuObjPop(null);

        assertThat(rows).extracting(r -> s(r, "OBJECT_ID")).containsExactly("OBJ_A", "OBJ_B", "OBJ_NONE");
        assertThat(s(rows.get(0), "PARENT_MENU_ID")).isIn("F_P1", "F_P2");
        assertThat(rows.get(1)).containsEntry("PARENT_MENU_ID", "F_P3");
        assertThat(rows.get(2).get("PARENT_MENU_ID")).isNull();
    }

    /** c2: searchMenuObjPop 의 || 결합 LIKE — OBJECT_ID 또는 OBJECT_NM, 대소문자 무시. */
    @Test
    @DisplayName("searchMenuObjPop — 검색어는 OBJECT_ID·OBJECT_NM 대소문자 무시 부분 일치")
    void searchMenuObjPop_filter() {
        obj("OBJ_A", "alpha", "Y");
        obj("OBJ_B", "Beta-Name", "Y");

        assertThat(menuRepo.searchMenuObjPop("obj_a")).extracting(r -> s(r, "OBJECT_ID")).containsExactly("OBJ_A");
        assertThat(menuRepo.searchMenuObjPop("beta-")).extracting(r -> s(r, "OBJECT_ID")).containsExactly("OBJ_B");
        assertThat(menuRepo.searchMenuObjPop("zzz")).isEmpty();
    }

    // ───────────────────────── 2026-11-26 메뉴 셋 · 놓이지 않은 OBJECT · FORM_URL 채우기 ─────────────────────────

    /** 메뉴 셋 조건 — NVL(MENU_TP,'WEB') 이라 NULL 은 WEB 에 든다. 폴더 지정(재귀)·전체 두 분기 모두. */
    @Test
    @DisplayName("searchCmMenu — 메뉴 셋 WEB 은 MENU_TP NULL 행을 포함하고 MOBIL 은 MOBIL 행만 (두 분기 모두)")
    void searchCmMenu_menuSet() {
        folderTree();
        menu("M_WEB", "1", "F_A1", null, "Y", "WEB");
        menu("M_NULL", "2", "F_A1", null, "Y", null);
        menu("M_MOB", "3", "F_A1", null, "Y", "MOBIL");

        assertThat(menuRepo.searchCmMenu(null, null, null, null, "WEB"))
                .extracting(r -> s(r, "MENU_ID")).containsExactly("M_NULL", "M_WEB");
        assertThat(menuRepo.searchCmMenu(null, "F_ROOT", null, null, "MOBIL"))
                .extracting(r -> s(r, "MENU_ID")).containsExactly("M_MOB");
        assertThat(menuRepo.searchCmMenu(null, "F_A", null, null, "WEB"))
                .extracting(r -> s(r, "MENU_ID")).containsExactly("M_NULL", "M_WEB");
        assertThat(menuRepo.searchCmMenu(null, null, null, null, " ")).as("빈 값 = 전체").hasSize(3);
    }

    /** 놓이지 않은 OBJECT — 그 셋에 메뉴 행이 없는 사용 OBJECT 만, OBJECT_ID 순, 검색어는 ID·이름 부분 일치. */
    @Test
    @DisplayName("searchUnplacedObj — 셋별로 놓이지 않은 USE_TP=Y OBJECT 만 (NULL MENU_TP 는 WEB, 빈 셋은 WEB), 검색어 필터")
    void searchUnplacedObj_perSet() {
        obj("OBJ_W", "web-only", "Y");     // WEB(NULL) 에만 놓임
        obj("OBJ_M", "mobile-only", "Y");  // MOBIL 에만 놓임
        obj("OBJ_FREE", "Free-Screen", "Y");
        obj("OBJ_OFF", "disabled", "N");
        menu("M_W", "1", "F_A", "OBJ_W", "Y", null);
        menu("M_M", "1", "F_A", "OBJ_M", "Y", "MOBIL");

        List<Map<String, Object>> web = menuRepo.searchUnplacedObj("WEB", null);
        assertThat(web).extracting(r -> s(r, "OBJECT_ID")).containsExactly("OBJ_FREE", "OBJ_M");
        assertThat(web.get(0)).containsOnlyKeys("OBJECT_ID", "OBJECT_NM", "SYSTEM_CODE", "OBJECT_TYPE", "FORM_URL")
                .containsEntry("OBJECT_NM", "Free-Screen").containsEntry("FORM_URL", "/u");
        assertThat(menuRepo.searchUnplacedObj(null, null)).extracting(r -> s(r, "OBJECT_ID"))
                .as("빈 셋 = WEB").containsExactly("OBJ_FREE", "OBJ_M");
        assertThat(menuRepo.searchUnplacedObj("MOBIL", null)).extracting(r -> s(r, "OBJECT_ID"))
                .containsExactly("OBJ_FREE", "OBJ_W");
        assertThat(menuRepo.searchUnplacedObj("MOBIL", "free-s")).extracting(r -> s(r, "OBJECT_ID"))
                .containsExactly("OBJ_FREE");
        assertThat(menuRepo.searchUnplacedObj("MOBIL", "obj_w")).extracting(r -> s(r, "OBJECT_ID"))
                .containsExactly("OBJ_W");
    }

    @Autowired TransactionTemplate tx;

    private void objForm(String id, String formUrl, String accessTp) {
        jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_SEC_OBJ (OBJECT_ID, OBJECT_NM, USE_TP, ACCESS_TP, FORM_URL) VALUES (?, ?, 'Y', ?, ?)",
                id, id + "-nm", accessTp, formUrl);
    }

    private String formUrl(String id) {
        return jdbc.queryForObject("SELECT FORM_URL FROM MCMAPUSER.TB_MCM_SEC_OBJ WHERE OBJECT_ID = ?", String.class, id);
    }

    /** FORM_URL 채우기 — 빈 값·'/' 없는 내부 값만 MIN(PARENT/OBJECT) 로, 경로가 있거나 외부 값이면 그대로, 두 번째는 0행. */
    @Test
    @DisplayName("backfillObjectFormUrl — 빈 FORM_URL·'/' 없는 값은 MIN(PARENT_MENU_ID/OBJECT_ID), 경로·외부 값·메뉴 없는 OBJECT 는 그대로, 멱등")
    void backfillObjectFormUrl() {
        objForm("O_BLANK", null, "내부");
        objForm("O_TWO", null, "내부");        // 두 폴더에 놓임 → MIN
        objForm("O_XFDL", "O_XFDL.xfdl", "내부"); // '/' 없는 옛 값 → 채움
        objForm("O_PATH", "keep/O_PATH", "내부"); // 이미 경로 → 그대로
        objForm("O_EXT", "extlink", "외부");    // 외부 + 값 있음 → 그대로
        objForm("O_EXT_BLANK", null, "외부");   // 외부라도 비었으면 채움
        objForm("O_NOMENU", null, "내부");      // 메뉴 없음 → 그대로(NULL)
        menu("M1", "1", "csa", "O_BLANK", "Y", "WEB");
        menu("M2", "1", "zzz", "O_TWO", "Y", "WEB");
        menu("M3", "1", "cmq", "O_TWO", "Y", "MOBIL");
        menu("M4", "1", "csa", "O_XFDL", "Y", "WEB");
        menu("M5", "1", "csa", "O_PATH", "Y", "WEB");
        menu("M6", "1", "csa", "O_EXT", "Y", "WEB");
        menu("M7", "1", "csa", "O_EXT_BLANK", "Y", "WEB");
        menu("M8", "1", null, "O_NOMENU", "Y", "WEB");  // 폴더 없는 메뉴만 있음 → 채울 값 없음

        Integer first = tx.execute(st -> menuRepo.backfillObjectFormUrl());

        assertThat(first).isEqualTo(4);
        assertThat(formUrl("O_BLANK")).isEqualTo("csa/O_BLANK");
        assertThat(formUrl("O_TWO")).isEqualTo("cmq/O_TWO");
        assertThat(formUrl("O_XFDL")).isEqualTo("csa/O_XFDL");
        assertThat(formUrl("O_PATH")).isEqualTo("keep/O_PATH");
        assertThat(formUrl("O_EXT")).isEqualTo("extlink");
        assertThat(formUrl("O_EXT_BLANK")).isEqualTo("csa/O_EXT_BLANK");
        assertThat(formUrl("O_NOMENU")).isNull();
        Integer second = tx.execute(st -> menuRepo.backfillObjectFormUrl());
        assertThat(second).as("멱등 — 두 번째는 0행").isZero();
    }
}
