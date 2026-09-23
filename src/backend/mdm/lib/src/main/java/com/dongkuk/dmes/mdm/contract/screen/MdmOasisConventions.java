package com.dongkuk.dmes.mdm.contract.screen;

/**
 * 모듈 ID·OASIS URL·screenId 규칙 — screens/README §5, TRD §3.
 * OASIS URL = {@link #OASIS_URL_PREFIX} + {serviceId}/{action}, serviceId = screenId.
 */
public final class MdmOasisConventions {

    public static final String MODULE_ID = "mdm";
    public static final String MENU_ROOT_ID = "mdm";
    public static final String OASIS_URL_PREFIX = "/api/mdm/oasis/";
    /** + {group}/{screenId}.bpmn */
    public static final String BPMN_LOCATION_PREFIX = "services/";
    /** + .{group}.{screenId}.{dto,service} */
    public static final String BACKEND_BASE_PACKAGE = "com.dongkuk.dmes.mdm";
    public static final String GROUP_CODE_PATTERN = "^dm[a-z]$";
    /** DataInitializer.insertMcmSecMenuIfAbsent 의 OBJECT_ID 검사와 같다. */
    public static final String SCREEN_ID_PATTERN = "^[a-z][a-zA-Z0-9]*$";

    private MdmOasisConventions() {
    }
}
