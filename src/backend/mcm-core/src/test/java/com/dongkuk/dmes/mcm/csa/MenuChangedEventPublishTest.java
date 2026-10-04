package com.dongkuk.dmes.mcm.csa;

import com.dongkuk.dmes.mcm.common.event.MenuChangedEvent;
import com.dongkuk.dmes.mcm.common.event.RoleChangedEvent;
import com.dongkuk.dmes.mcm.csa.commMenuMng.service.CommMenuMngService;
import com.dongkuk.dmes.mcm.csa.commObjMng.service.CommObjMngService;
import com.dongkuk.dmes.mcm.entity.SecRoleMapping;
import com.dongkuk.dmes.mcm.repository.SecMenuFldLovRepository;
import com.dongkuk.dmes.mcm.repository.SecMenuNativeRepository;
import com.dongkuk.dmes.mcm.repository.SecMenuRepository;
import com.dongkuk.dmes.mcm.repository.SecObjRepository;
import com.dongkuk.dmes.mcm.repository.SecRoleMappingRepository;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.context.ApplicationEventPublisher;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 메뉴·메뉴 폴더·OBJECT 저장이 실제로 바뀐 행이 있을 때만 {@link MenuChangedEvent} 를 내는지 — 메뉴 카탈로그 무효화 신호.
 * 저장소는 mock 이다. 끝에서 끝(OASIS 커밋 뒤 다음 조회에 보이는지)은 mcm/api 의 통합 시험이 본다.
 */
class MenuChangedEventPublishTest {

    final List<Object> events = new ArrayList<>();
    final ApplicationEventPublisher publisher = events::add;

    final SecMenuRepository menuRepo = mock(SecMenuRepository.class);
    final SecMenuNativeRepository nativeRepo = mock(SecMenuNativeRepository.class);
    final SecObjRepository objRepo = mock(SecObjRepository.class);
    final SecRoleMappingRepository roleMappingRepo = mock(SecRoleMappingRepository.class);

    final CommMenuMngService menuService = new CommMenuMngService(menuRepo, nativeRepo, publisher);
    final CommObjMngService objService =
            new CommObjMngService(objRepo, mock(SecMenuFldLovRepository.class), roleMappingRepo, publisher);

    @Test
    @DisplayName("메뉴 저장 — 저장한 행이 있으면 MENU 이벤트 하나, 없으면 내지 않는다")
    void saveCmMenu() {
        when(menuRepo.findById("M1")).thenReturn(Optional.empty());
        menuService.saveCmMenu(List.of(row("rowStatus", "C", "MENU_ID", "M1", "PARENT_MENU_ID", "csa")));
        assertThat(events).containsExactly(new MenuChangedEvent(MenuChangedEvent.MENU));

        events.clear();
        when(menuRepo.existsById("GONE")).thenReturn(false);
        menuService.saveCmMenu(List.of(
                row("rowStatus", "D", "MENU_ID", "GONE"),
                row("rowStatus", "X", "MENU_ID", "M2")));
        menuService.saveCmMenu(null);
        assertThat(events).isEmpty();
    }

    @Test
    @DisplayName("메뉴 저장 — 있는 메뉴를 지우면 MENU 이벤트 하나를 낸다")
    void saveCmMenuDeleteExisting() {
        when(menuRepo.existsById("M1")).thenReturn(true);

        menuService.saveCmMenu(List.of(row("rowStatus", "D", "MENU_ID", "M1")));

        verify(menuRepo).deleteById("M1");
        assertThat(events).containsExactly(new MenuChangedEvent(MenuChangedEvent.MENU));
    }

    @Test
    @DisplayName("메뉴 폴더 저장 — 바뀐 행이 있으면 MENU_FOLDER 이벤트, UPDATE 0건·skip 뿐이면 내지 않는다")
    void saveCmMenuFld() {
        when(nativeRepo.updateMenuFld(anyString(), anyString(), anyString(), any(), any())).thenReturn(0);
        menuService.saveCmMenuFld(List.of(
                row("nativeeditor_status", "U", "MENU_ID", "F1", "MENU_SEQ", "1", "MENU_NM", "폴더"),
                row("nativeeditor_status", "N", "MENU_ID", "F2")));
        assertThat(events).isEmpty();

        when(nativeRepo.deleteMenuFld("F3")).thenReturn(1);
        menuService.saveCmMenuFld(List.of(row("nativeeditor_status", "D", "MENU_ID", "F3")));
        assertThat(events).containsExactly(new MenuChangedEvent(MenuChangedEvent.MENU_FOLDER));
    }

    @Test
    @DisplayName("OBJECT 저장 — SYSADMIN 매핑이 이미 있어 역할 이벤트가 없는 update 도 OBJECT 이벤트는 낸다")
    void saveCmObjUpdateWithoutRbacChange() {
        when(objRepo.findById("O1")).thenReturn(Optional.empty());
        when(roleMappingRepo.existsById(any(SecRoleMapping.PK.class))).thenReturn(true);

        objService.saveCmObj(List.of(row("rowStatus", "U", "OBJECT_ID", "O1")));

        assertThat(events).containsExactly(new MenuChangedEvent(MenuChangedEvent.OBJECT));
    }

    @Test
    @DisplayName("OBJECT 저장 — 매핑을 새로 만들면 역할 이벤트와 OBJECT 이벤트를 모두 내고, 막힌 삭제만 있으면 아무것도 내지 않는다")
    void saveCmObjInsertAndBlockedDelete() {
        when(objRepo.findById("O1")).thenReturn(Optional.empty());
        when(roleMappingRepo.existsById(any(SecRoleMapping.PK.class))).thenReturn(false);
        objService.saveCmObj(List.of(row("rowStatus", "C", "OBJECT_ID", "O1")));
        assertThat(events).hasSize(2);
        assertThat(events.get(0)).isInstanceOf(RoleChangedEvent.class);
        assertThat(events.get(1)).isEqualTo(new MenuChangedEvent(MenuChangedEvent.OBJECT));

        events.clear();
        when(objRepo.countMenuByObjectId("O2")).thenReturn(1L);
        when(roleMappingRepo.findByObjectId("O2")).thenReturn(List.of());
        objService.saveCmObj(List.of(row("rowStatus", "D", "OBJECT_ID", "O2")));
        assertThat(events).isEmpty();
    }

    @Test
    @DisplayName("OBJECT 저장 — 매핑 없는 OBJECT 를 지우면 OBJECT 이벤트만 낸다")
    void saveCmObjDeleteWithoutMapping() {
        when(objRepo.countMenuByObjectId("O3")).thenReturn(0L);
        when(roleMappingRepo.findByObjectId("O3")).thenReturn(List.of());
        when(objRepo.existsById("O3")).thenReturn(true);

        objService.saveCmObj(List.of(row("rowStatus", "D", "OBJECT_ID", "O3")));

        verify(objRepo).deleteById("O3");
        assertThat(events).containsExactly(new MenuChangedEvent(MenuChangedEvent.OBJECT));
    }

    @Test
    @DisplayName("OBJECT 저장 — SYSADMIN 매핑만 있는 OBJECT 를 지우면 매핑을 함께 지우고 역할 이벤트와 OBJECT 이벤트를 낸다")
    void saveCmObjDeleteWithSysadminMapping() {
        SecRoleMapping sysadmin = new SecRoleMapping();
        sysadmin.setRoleId("SYSADMIN");
        sysadmin.setObjectId("O4");
        sysadmin.setPermissionId("PERM_ALL");
        when(objRepo.countMenuByObjectId("O4")).thenReturn(0L);
        when(roleMappingRepo.findByObjectId("O4")).thenReturn(List.of(sysadmin));
        when(objRepo.existsById("O4")).thenReturn(true);

        objService.saveCmObj(List.of(row("rowStatus", "D", "OBJECT_ID", "O4")));

        verify(roleMappingRepo).deleteAll(List.of(sysadmin));
        verify(objRepo).deleteById("O4");
        assertThat(events).hasSize(2);
        assertThat(events.get(0)).isInstanceOf(RoleChangedEvent.class);
        assertThat(events.get(1)).isEqualTo(new MenuChangedEvent(MenuChangedEvent.OBJECT));
    }

    private static Map<String, Object> row(String... kv) {
        Map<String, Object> m = new HashMap<>();
        for (int i = 0; i < kv.length; i += 2) m.put(kv[i], kv[i + 1]);
        return m;
    }
}
