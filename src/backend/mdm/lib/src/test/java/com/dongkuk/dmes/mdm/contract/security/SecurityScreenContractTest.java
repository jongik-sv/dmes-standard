package com.dongkuk.dmes.mdm.contract.security;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.mdm.contract.screen.MdmOasisConventions;
import com.dongkuk.dmes.mdm.contract.screen.MdmScreenGroup;
import java.lang.reflect.Field;
import java.lang.reflect.Modifier;
import java.util.Arrays;
import java.util.EnumMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import org.junit.jupiter.api.Test;

/**
 * TSK-01-02 design.md §3.1 T4 — 역할·권한 액션·권한 세트·그룹×역할 매트릭스(ADR-0003 D5),
 * 화면 그룹 코드(screens/README §2, ADR-0003 D1), OASIS 규칙(불변 규칙 I10·I11).
 */
class SecurityScreenContractTest {

    private static final Set<String> READ = Set.of("search", "view", "export", "compare");
    private static final Set<String> EDIT = Set.of("search", "view", "export", "compare",
            "save", "delete", "reg", "import", "validate", "execute", "copy", "restore", "lock", "unlock", "handover");

    @Test
    void 역할은_표준관리자와_담당자_2종이다() {
        assertEquals("MDM_STD_ADMIN", MdmRoles.STD_ADMIN);
        assertEquals("MDM_STEWARD", MdmRoles.STEWARD);
        assertEquals(List.of("MDM_STD_ADMIN", "MDM_STEWARD"), MdmRoles.ALL);
    }

    @Test
    void 권한_세트_ID_3종() {
        assertEquals("PERM_MDM_READ", MdmPermissions.READ);
        assertEquals("PERM_MDM_EDIT", MdmPermissions.EDIT);
        assertEquals("PERM_MDM_CONFIRM", MdmPermissions.CONFIRM);
    }

    @Test
    void 권한_세트별_액션_집합이_ADR_0003_과_같다() {
        Set<String> read = new HashSet<>(MdmPermissions.READ_ACTIONS);
        Set<String> edit = new HashSet<>(MdmPermissions.EDIT_ACTIONS);
        Set<String> confirm = new HashSet<>(MdmPermissions.CONFIRM_ACTIONS);

        assertEquals(READ, read);
        assertEquals(EDIT, edit);
        assertEquals(MdmPermissions.READ_ACTIONS.size(), read.size(), "READ_ACTIONS 에 중복이 있다");
        assertEquals(MdmPermissions.EDIT_ACTIONS.size(), edit.size(), "EDIT_ACTIONS 에 중복이 있다");
        assertEquals(MdmPermissions.CONFIRM_ACTIONS.size(), confirm.size(), "CONFIRM_ACTIONS 에 중복이 있다");

        assertTrue(edit.containsAll(read), "READ ⊂ EDIT");
        assertTrue(confirm.containsAll(edit), "EDIT ⊂ CONFIRM");
        Set<String> confirmOnly = new HashSet<>(confirm);
        confirmOnly.removeAll(edit);
        assertEquals(Set.of("confirm"), confirmOnly);
    }

    @Test
    void 액션_상수_16종은_모두_어느_세트엔가_있다() throws IllegalAccessException {
        Set<String> actions = stringConstants(MdmActions.class);
        assertEquals(Set.of("search", "view", "export", "compare", "save", "delete", "reg", "import",
                "validate", "execute", "copy", "restore", "lock", "unlock", "handover", "confirm"), actions);
        assertTrue(new HashSet<>(MdmPermissions.CONFIRM_ACTIONS).containsAll(actions));
    }

    @Test
    void DRAFT_소유권_액션_lock_unlock_handover_는_EDIT_와_CONFIRM_에만_있다() {
        // TSK-08-02 D4 — 선점·해제·넘기기는 편집 권한이다. 조회 권한(READ)으로는 할 수 없다.
        for (String action : List.of(MdmActions.LOCK, MdmActions.UNLOCK, MdmActions.HANDOVER)) {
            assertFalse(MdmPermissions.READ_ACTIONS.contains(action), action + " 이 READ 에 있다");
            assertTrue(MdmPermissions.EDIT_ACTIONS.contains(action), action + " 이 EDIT 에 없다");
            assertTrue(MdmPermissions.CONFIRM_ACTIONS.contains(action), action + " 이 CONFIRM 에 없다");
        }
        assertEquals(List.of("lock", "unlock", "handover"),
                MdmPermissions.EDIT_ACTIONS.subList(MdmPermissions.EDIT_ACTIONS.indexOf("restore") + 1, MdmPermissions.EDIT_ACTIONS.size()),
                "EDIT 순서는 restore 뒤 lock·unlock·handover(시드 PERMISSION_ACTION 과 같은 순서)");
        assertEquals("confirm", MdmPermissions.CONFIRM_ACTIONS.get(MdmPermissions.CONFIRM_ACTIONS.size() - 1), "confirm 이 맨 끝");
    }

    @Test
    void 그룹_역할_매트릭스_10칸이_ADR_0003_과_같다() {
        Map<MdmScreenGroup, Map<String, String>> expected = new EnumMap<>(MdmScreenGroup.class);
        expected.put(MdmScreenGroup.DMA, Map.of(MdmRoles.STD_ADMIN, "PERM_MDM_EDIT", MdmRoles.STEWARD, "PERM_MDM_READ"));
        expected.put(MdmScreenGroup.DMB, Map.of(MdmRoles.STD_ADMIN, "PERM_MDM_EDIT", MdmRoles.STEWARD, "PERM_MDM_CONFIRM"));
        expected.put(MdmScreenGroup.DMC, Map.of(MdmRoles.STD_ADMIN, "PERM_MDM_READ", MdmRoles.STEWARD, "PERM_MDM_CONFIRM"));
        expected.put(MdmScreenGroup.DMD, Map.of(MdmRoles.STD_ADMIN, "PERM_MDM_READ", MdmRoles.STEWARD, "PERM_MDM_EDIT"));
        expected.put(MdmScreenGroup.DME, Map.of(MdmRoles.STD_ADMIN, "PERM_MDM_READ", MdmRoles.STEWARD, "PERM_MDM_CONFIRM"));

        assertEquals(Set.of(MdmScreenGroup.values()), MdmPermissions.MATRIX.keySet(), "매트릭스 키는 5그룹 전부");
        assertEquals(expected, new EnumMap<>(MdmPermissions.MATRIX));
        int cells = MdmPermissions.MATRIX.values().stream().mapToInt(Map::size).sum();
        assertEquals(10, cells);
    }

    @Test
    void 화면_그룹은_dma_부터_dme_까지_5종이고_폴더_이름이_screens_README_와_같다() {
        Map<String, String> expected = new LinkedHashMap<>();
        expected.put("dma", "용어·도메인");
        expected.put("dmb", "레이아웃");
        expected.put("dmc", "마스터코드");
        expected.put("dmd", "마스터데이터");
        expected.put("dme", "업무기준");

        Map<String, String> actual = Arrays.stream(MdmScreenGroup.values())
                .collect(Collectors.toMap(MdmScreenGroup::code, MdmScreenGroup::menuFolderName,
                        (a, b) -> a, LinkedHashMap::new));
        assertEquals(expected, actual);

        Pattern groupPattern = Pattern.compile(MdmOasisConventions.GROUP_CODE_PATTERN);
        for (MdmScreenGroup group : MdmScreenGroup.values()) {
            assertTrue(groupPattern.matcher(group.code()).matches(), group + " 코드가 그룹 패턴과 맞지 않는다");
        }
    }

    @Test
    void OASIS_규칙_상수() {
        assertEquals("mdm", MdmOasisConventions.MODULE_ID);
        assertEquals("mdm", MdmOasisConventions.MENU_ROOT_ID);
        assertEquals("/api/mdm/oasis/", MdmOasisConventions.OASIS_URL_PREFIX);
        assertEquals("services/", MdmOasisConventions.BPMN_LOCATION_PREFIX);
        assertEquals("com.dongkuk.dmes.mdm", MdmOasisConventions.BACKEND_BASE_PACKAGE);

        Pattern screenId = Pattern.compile(MdmOasisConventions.SCREEN_ID_PATTERN);
        assertTrue(screenId.matcher("mdmSample").matches());
        assertTrue(screenId.matcher("codeConfirm").matches());
        assertFalse(screenId.matcher("MdmSample").matches());
        assertFalse(screenId.matcher("mdm_sample").matches());
    }

    private static Set<String> stringConstants(Class<?> type) throws IllegalAccessException {
        Set<String> values = new HashSet<>();
        for (Field field : type.getDeclaredFields()) {
            if (Modifier.isStatic(field.getModifiers()) && field.getType() == String.class) {
                values.add((String) field.get(null));
            }
        }
        return values;
    }
}
