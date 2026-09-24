package com.dongkuk.dmes.mdm.contract.security;

import static com.dongkuk.dmes.mdm.contract.security.MdmActions.COMPARE;
import static com.dongkuk.dmes.mdm.contract.security.MdmActions.COPY;
import static com.dongkuk.dmes.mdm.contract.security.MdmActions.DELETE;
import static com.dongkuk.dmes.mdm.contract.security.MdmActions.EXECUTE;
import static com.dongkuk.dmes.mdm.contract.security.MdmActions.EXPORT;
import static com.dongkuk.dmes.mdm.contract.security.MdmActions.HANDOVER;
import static com.dongkuk.dmes.mdm.contract.security.MdmActions.IMPORT;
import static com.dongkuk.dmes.mdm.contract.security.MdmActions.LOCK;
import static com.dongkuk.dmes.mdm.contract.security.MdmActions.REG;
import static com.dongkuk.dmes.mdm.contract.security.MdmActions.RESTORE;
import static com.dongkuk.dmes.mdm.contract.security.MdmActions.SAVE;
import static com.dongkuk.dmes.mdm.contract.security.MdmActions.SEARCH;
import static com.dongkuk.dmes.mdm.contract.security.MdmActions.UNLOCK;
import static com.dongkuk.dmes.mdm.contract.security.MdmActions.VALIDATE;
import static com.dongkuk.dmes.mdm.contract.security.MdmActions.VIEW;

import com.dongkuk.dmes.mdm.contract.screen.MdmScreenGroup;
import java.util.List;
import java.util.Map;

/**
 * 권한 세트 3종·세트별 액션·그룹 × 역할 매트릭스 — ADR-0003 D5. READ ⊂ EDIT ⊂ CONFIRM, CONFIRM − EDIT = {confirm}.
 * 시드는 TSK-01-03 이 이 상수로 만든다.
 */
public final class MdmPermissions {

    public static final String READ = "PERM_MDM_READ";
    public static final String EDIT = "PERM_MDM_EDIT";
    public static final String CONFIRM = "PERM_MDM_CONFIRM";

    public static final List<String> READ_ACTIONS = List.of(SEARCH, VIEW, EXPORT, COMPARE);

    /** 편집 — DRAFT 소유권(lock·unlock·handover)은 restore 뒤에 둔다(TSK-08-02 D4, 시드 PERMISSION_ACTION 과 같은 순서). */
    public static final List<String> EDIT_ACTIONS = List.of(SEARCH, VIEW, EXPORT, COMPARE,
            SAVE, DELETE, REG, IMPORT, VALIDATE, EXECUTE, COPY, RESTORE, LOCK, UNLOCK, HANDOVER);

    public static final List<String> CONFIRM_ACTIONS = List.of(SEARCH, VIEW, EXPORT, COMPARE,
            SAVE, DELETE, REG, IMPORT, VALIDATE, EXECUTE, COPY, RESTORE, LOCK, UNLOCK, HANDOVER, MdmActions.CONFIRM);

    /** 그룹 × 역할 → PERM ID. SYSADMIN 은 여기 없다(기존대로 PERM_ALL). */
    public static final Map<MdmScreenGroup, Map<String, String>> MATRIX = Map.of(
            MdmScreenGroup.DMA, Map.of(MdmRoles.STD_ADMIN, EDIT, MdmRoles.STEWARD, READ),
            MdmScreenGroup.DMB, Map.of(MdmRoles.STD_ADMIN, EDIT, MdmRoles.STEWARD, READ),
            MdmScreenGroup.DMC, Map.of(MdmRoles.STD_ADMIN, READ, MdmRoles.STEWARD, CONFIRM),
            MdmScreenGroup.DMD, Map.of(MdmRoles.STD_ADMIN, READ, MdmRoles.STEWARD, EDIT),
            MdmScreenGroup.DME, Map.of(MdmRoles.STD_ADMIN, READ, MdmRoles.STEWARD, CONFIRM));

    private MdmPermissions() {
    }
}
