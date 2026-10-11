package com.dongkuk.dmes.mdm.dma.erdEdit.engine;

import java.util.regex.Pattern;

/**
 * 사람용 다음 할 일(UX 1차 U27). hint 는 MCP·CLI(LLM)용 글이라 그대로 두고, 화면은 이 값만 보인다.
 * 기계 용어가 없으면 hint 그대로, 있으면 정본 표(plans/2026-10-11-erd-ux1/README.md "userHint 변환 정본")의 사람 글,
 * 맞는 글이 없으면 null(화면에 안내 없음). 먼저 맞는 행이 이긴다.
 */
public final class ErdUserHints {
    /** 기계 용어 판정 정규식(정본). */
    public static final Pattern MACHINE = Pattern.compile(
            "getChangesSince|getModelText|baseRev|\\bview\\b|kind=|restore|undo\\(|\\bop\\b|JSON|setPrimaryKey|confirmRelation|updateRelation|copy 로");
    private static final String REFRESH = "화면을 새로 고친 뒤 다시 하세요.";

    private ErdUserHints() {}

    public static String of(String code, String hint, String ownerId) {
        if (hint == null || hint.isBlank()) return null;
        if (!MACHINE.matcher(hint).find()) return hint;
        if (hint.contains("getChangesSince(") && hint.contains("다시 보내세요")) return "화면이 최신 값으로 바뀌었습니다. 확인한 뒤 다시 고치세요.";
        if (hint.contains("getChangesSince 로 확인한 뒤 직접 고치세요")) return "그 뒤에 바뀐 값이 있어 되돌릴 수 없습니다. 변경 기록에서 다른 변경을 고르거나 직접 고치세요.";
        if (hint.contains("getChangesSince 로 최신 모델을 읽으세요")) return "다른 사람이 지운 요소입니다. 화면이 최신 상태로 바뀌었는지 확인하세요.";
        if (hint.contains("getChangesSince 가 준 값을 그대로") || hint.contains("restore 값은")) return null;
        // 아래 줄은 "reload 를 주면" 행보다 먼저여야 한다(같은 hint 에 둘 다 든다).
        if (hint.contains("지금 DRAFT 에서 한 변경만 되돌리세요")) return "지금 DRAFT 에서 한 변경만 되돌릴 수 있습니다.";
        if (hint.contains("getModelText 로") || hint.contains("가 준 rev") || hint.contains("로 받은 rev")
                || hint.contains("view 가 준 rev") || hint.contains("reload 를 주면 모델을 다시 읽고")) return REFRESH;
        if (hint.contains("compare kind=DB_DIFF")) return "[DB 다시 가져오기] 탭에서 [새로 읽기] 한 뒤 다시 고르세요.";
        if (hint.contains("import kind=FROM_DB")) return "[DB 에서 가져오기] 로 먼저 가져오세요.";
        if (hint.contains("execute kind=ADD_EDITOR"))
            return ownerId == null ? "소유자에게 공동 편집자 등록을 요청하세요." : "소유자(" + ownerId + ")에게 공동 편집자 등록을 요청하세요.";
        if (hint.contains("copy 로 새 버전")) return "[버전 ▾] 에서 [새 버전] 을 만드세요.";
        if (hint.contains("setPrimaryKey 로")) return "PK 는 [PK 추가] 로 바꾸세요.";
        if (hint.contains("confirmRelation 또는 updateRelation")) return "이미 있는 관계입니다. 추정 관계면 [맞음] 으로 확정하세요.";
        // 화면이 만들지 않는 요청 형식 오류 — 정본 표 마지막 행. 아래 글은 모두 기계 용어를 품고 있어 위에서 안 걸리면 여기로 온다.
        // 마지막의 `return null` 이 같은 결과를 내지만, 표의 행을 코드에서 찾을 수 있게 남긴다.
        if (hint.contains("op 를 넣으세요") || hint.contains("명령 JSON") || hint.contains("{\"op\"")
                || hint.contains("되돌리기는 undo") || hint.contains("필드 이름·값 형식")) return null;
        return null;
    }
}
