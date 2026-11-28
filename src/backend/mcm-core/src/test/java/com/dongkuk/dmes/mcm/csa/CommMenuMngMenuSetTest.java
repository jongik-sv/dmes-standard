package com.dongkuk.dmes.mcm.csa;

import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import com.dongkuk.dmes.mcm.csa.commMenuMng.dto.CommMenuMngSearchRequest;
import com.dongkuk.dmes.mcm.csa.commMenuMng.dto.CommMenuMngSearchUnplacedObjRequest;
import com.dongkuk.dmes.mcm.csa.commMenuMng.service.CommMenuMngService;
import com.dongkuk.dmes.mcm.entity.SecMenu;
import com.dongkuk.dmes.mcm.repository.SecMenuNativeRepository;
import com.dongkuk.dmes.mcm.repository.SecMenuRepository;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * commMenuMng 메뉴 셋 (2026-11-26) — 조회 조건 전달, 놓이지 않은 OBJECT 조회, 신규 행 MENU_ID 자동 부여, 저장 전후 FORM_URL 고정.
 * 저장소는 mock 이다. SQL 자체는 {@code oracheck.MenuTreeSqlOraTest}, OASIS 끝에서 끝은 mcm/api {@code CommMenuMngMenuSetOasisTest}.
 */
class CommMenuMngMenuSetTest {

    final SecMenuRepository menuRepo = mock(SecMenuRepository.class);
    final SecMenuNativeRepository nativeRepo = mock(SecMenuNativeRepository.class);
    final List<Object> events = new ArrayList<>();
    final CommMenuMngService service = new CommMenuMngService(menuRepo, nativeRepo, events::add);

    private static Map<String, Object> insertRow(String menuId, String objectId, String menuTp) {
        Map<String, Object> row = new HashMap<>();
        row.put("rowStatus", "inserted");
        row.put("MENU_ID", menuId);
        row.put("MENU_NM", "화면");
        row.put("OBJECT_ID", objectId);
        row.put("MENU_TP", menuTp);
        row.put("PARENT_MENU_ID", "csa");
        return row;
    }

    private List<String> savedMenuIds(int times) {
        ArgumentCaptor<SecMenu> saved = ArgumentCaptor.forClass(SecMenu.class);
        verify(menuRepo, times(times)).save(saved.capture());
        return saved.getAllValues().stream().map(SecMenu::getMenuId).toList();
    }

    @Test
    @DisplayName("search — cboMENUTP 를 저장소 5번째 인자로 넘긴다")
    void searchPassesMenuSet() {
        CommMenuMngSearchRequest req = new CommMenuMngSearchRequest();
        req.setCboMENUTP("MOBIL");
        req.setCboUSETP("Y");

        service.searchCmMenu(req);

        verify(nativeRepo).searchCmMenu(null, null, null, "Y", "MOBIL");
    }

    @Test
    @DisplayName("searchUnplacedObj — 셋·검색어를 넘기고 ds_unplacedObj 로 돌려준다")
    void searchUnplacedObj() {
        List<Map<String, Object>> rows = List.of(Map.of("OBJECT_ID", "commMenuMng"));
        when(nativeRepo.searchUnplacedObj("MOBIL", "comm")).thenReturn(rows);
        CommMenuMngSearchUnplacedObjRequest req = new CommMenuMngSearchUnplacedObjRequest();
        req.setCboMENUTP("MOBIL");
        req.setEdtOBJECTID("comm");

        Map<String, Object> out = service.searchUnplacedObj(req);

        assertThat(out).containsOnlyKeys("ds_unplacedObj").containsEntry("ds_unplacedObj", rows);
    }

    @Test
    @DisplayName("자동 MENU_ID — OBJECT_ID 가 비어 있으면 그것, 쓰이면 OBJECT_ID_MENU_TP (빈 셋은 WEB)")
    void autoMenuIdFromObjectThenSet() {
        when(menuRepo.findById(anyString())).thenReturn(Optional.empty());
        when(menuRepo.existsById("commMenuMng")).thenReturn(true);

        service.saveCmMenu(List.of(
                insertRow(null, "commUserMng", null),
                insertRow("", "commMenuMng", "MOBIL"),
                insertRow(" ", "commMenuMng", null)));

        assertThat(savedMenuIds(3)).containsExactly("commUserMng", "commMenuMng_MOBIL", "commMenuMng_WEB");
    }

    @Test
    @DisplayName("자동 MENU_ID — 같은 묶음에서 이미 쓴 값(명시 MENU_ID·앞 행 자동 값)과 겹치지 않는다")
    void autoMenuIdUniqueWithinBatch() {
        when(menuRepo.findById(anyString())).thenReturn(Optional.empty());

        service.saveCmMenu(List.of(
                insertRow(null, "commUserMng", "WEB"),
                insertRow(null, "commUserMng", "MOBIL"),
                insertRow("commObjMng", "x", "WEB"),
                insertRow(null, "commObjMng", "WEB")));

        assertThat(savedMenuIds(4)).containsExactly("commUserMng", "commUserMng_MOBIL", "commObjMng", "commObjMng_WEB");
    }

    @Test
    @DisplayName("자동 MENU_ID — 둘 다 쓰이거나 30자를 넘으면 직접 입력을 요구하며 거부, OBJECT 도 없으면 거부")
    void autoMenuIdRejects() {
        when(menuRepo.existsById(anyString())).thenReturn(true);
        assertThatThrownBy(() -> service.saveCmMenu(List.of(insertRow(null, "commMenuMng", "MOBIL"))))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("commMenuMng_MOBIL")
                .hasMessageContaining("MENU_ID 를 직접 입력하세요");

        when(menuRepo.existsById(anyString())).thenReturn(false);
        String obj30 = "a".repeat(30);   // OBJECT_ID 자체는 30자라 쓸 수 있다
        when(menuRepo.findById(anyString())).thenReturn(Optional.empty());
        service.saveCmMenu(List.of(insertRow(null, obj30, "WEB")));
        assertThat(savedMenuIds(1)).containsExactly(obj30);

        String obj31 = "b".repeat(31);   // 31자 → 그대로도, _WEB 을 붙여도 30자를 넘는다
        assertThatThrownBy(() -> service.saveCmMenu(List.of(insertRow(null, obj31, "WEB"))))
                .isInstanceOf(BusinessException.class).hasMessageContaining("30자");

        assertThatThrownBy(() -> service.saveCmMenu(List.of(insertRow(null, null, "WEB"))))
                .isInstanceOf(BusinessException.class).hasMessageContaining("OBJECT");
    }

    @Test
    @DisplayName("빈 MENU_ID 는 inserted 가 아니면 예전처럼 건너뛴다")
    void blankMenuIdSkippedForOtherStatuses() {
        Map<String, Object> upd = insertRow(null, "commMenuMng", "WEB");
        upd.put("rowStatus", "updated");
        Map<String, Object> del = insertRow("", "commMenuMng", "WEB");
        del.put("rowStatus", "D");

        service.saveCmMenu(List.of(upd, del));

        verify(menuRepo, never()).save(any());
        verify(menuRepo, never()).deleteById(any());
    }

    @Test
    @DisplayName("저장 전후로 FORM_URL 고정을 부르고, 그것만 바뀌어도 MENU 이벤트를 낸다")
    void backfillsFormUrlAroundSave() {
        when(nativeRepo.backfillObjectFormUrl()).thenReturn(1, 0);

        service.saveCmMenu(List.of());

        verify(nativeRepo, times(2)).backfillObjectFormUrl();
        assertThat(events).hasSize(1);
    }
}
