package com.dongkuk.dmes.mdm.dma.erdEdit.engine;

import static org.assertj.core.api.Assertions.assertThat;

import com.dongkuk.dmes.mdm.dma.erdEdit.model.ErdModelCodec;
import com.fasterxml.jackson.databind.JsonNode;
import java.util.List;
import java.util.regex.Pattern;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

/** 사람용 다음 할 일(UX 1차 U27) — 변환 정본은 plans/2026-10-11-erd-ux1/README.md "userHint 변환 정본" 표. */
class ErdUserHintsTest {
    private static final Pattern MACHINE = ErdUserHints.MACHINE;

    /** Review Focus 6: 조사로 모은 기계 hint → userHint 에 기계 용어가 없다. 정본 표(README) 값과 같다. */
    @ParameterizedTest
    @CsvSource(delimiter = '|', value = {
        "CONFLICT|getChangesSince(212) 로 최신 값을 읽고 다시 보내세요|화면이 최신 값으로 바뀌었습니다. 확인한 뒤 다시 고치세요.",
        "CONFLICT|getChangesSince 로 확인한 뒤 직접 고치세요|그 뒤에 바뀐 값이 있어 되돌릴 수 없습니다. 변경 기록에서 다른 변경을 고르거나 직접 고치세요.",
        "NOT_FOUND|getChangesSince 로 최신 모델을 읽으세요|다른 사람이 지운 요소입니다. 화면이 최신 상태로 바뀌었는지 확인하세요.",
        "NOT_FOUND|getModelText 로 id 를 확인하세요|화면을 새로 고친 뒤 다시 하세요.",
        "NOT_FOUND|getModelText 로 다이어그램을 확인하세요|화면을 새로 고친 뒤 다시 하세요.",
        "INVALID|getChangesSince 가 준 rev 를 쓰세요|화면을 새로 고친 뒤 다시 하세요.",
        "INVALID|getChangesSince 로 받은 rev 를 쓰세요|화면을 새로 고친 뒤 다시 하세요.",
        "INVALID|view 가 준 rev 를 쓰세요|화면을 새로 고친 뒤 다시 하세요.",
        "INVALID|지금 DRAFT 에서 한 변경만 되돌리세요. getChangesSince 가 reload 를 주면 모델을 다시 읽으세요|지금 DRAFT 에서 한 변경만 되돌릴 수 있습니다.",
        "INVALID|getChangesSince 가 reload 를 주면 모델을 다시 읽고(view) 새 rev 를 baseRev 로 다시 보내세요|화면을 새로 고친 뒤 다시 하세요.",
        "INVALID|다시 가져오기 차이는 compare kind=DB_DIFF 로 보세요|[DB 다시 가져오기] 탭에서 [새로 읽기] 한 뒤 다시 고르세요.",
        "INVALID|compare kind=DB_DIFF 로 차이를 다시 읽고 고르세요|[DB 다시 가져오기] 탭에서 [새로 읽기] 한 뒤 다시 고르세요.",
        "INVALID|compare kind=DB_DIFF 를 읽은 rev 를 쓰세요|[DB 다시 가져오기] 탭에서 [새로 읽기] 한 뒤 다시 고르세요.",
        "INVALID|import kind=FROM_DB 로 첫 가져오기를 하세요|[DB 에서 가져오기] 로 먼저 가져오세요.",
        "NOT_EDITOR|copy 로 새 버전을 먼저 만드세요|[버전 ▾] 에서 [새 버전] 을 만드세요.",
        "INVALID|setPrimaryKey 로 바꾸세요|PK 는 [PK 추가] 로 바꾸세요.",
        "INVALID|confirmRelation 또는 updateRelation 으로 기존 관계를 쓰세요|이미 있는 관계입니다. 추정 관계면 [맞음] 으로 확정하세요.",
    })
    void mapsMachineHints(String code, String hint, String expected) {
        assertThat(ErdUserHints.of(code, hint, null)).isEqualTo(expected);
        assertThat(MACHINE.matcher(expected).find()).isFalse();
    }

    @Test
    void addEditorUsesOwner() {
        assertThat(ErdUserHints.of("NOT_EDITOR", "소유자(41000132)에게 공동 편집자 등록(execute kind=ADD_EDITOR)을 요청하세요", "41000132"))
                .isEqualTo("소유자(41000132)에게 공동 편집자 등록을 요청하세요.");
        // 소유자가 없으면(DRAFT 가 없을 때) 이름을 넣지 않는다.
        assertThat(ErdUserHints.of("NOT_EDITOR", "공동 편집자 등록(execute kind=ADD_EDITOR)을 요청하세요", null))
                .isEqualTo("소유자에게 공동 편집자 등록을 요청하세요.");
    }

    @Test
    void humanHintPassesThrough() {
        assertThat(ErdUserHints.of("INVALID", "다른 물리명을 쓰세요", null)).isEqualTo("다른 물리명을 쓰세요");
    }

    /** 화면이 만들지 않는 요청 형식 오류(README 표 마지막 행)와 값 그대로 쓰라는 안내는 null — 화면에 안내를 띄우지 않는다. */
    @Test
    void requestShapeHintsGiveNull() {
        assertThat(ErdUserHints.of("INVALID", "op 를 넣으세요", null)).isNull();
        assertThat(ErdUserHints.of("INVALID", "명령 JSON 의 모양과 값 형식을 확인하세요", null)).isNull();
        assertThat(ErdUserHints.of("INVALID", "{\"op\":\"...\", ...} 모양으로 보내세요", null)).isNull();
        assertThat(ErdUserHints.of("INVALID", "되돌리기는 undo(restore 액션)를 쓰세요", null)).isNull();
        assertThat(ErdUserHints.of("INVALID", "op 와 필드 이름·값 형식(숫자·불리언은 따옴표 없이)을 확인하세요", null)).isNull();
        assertThat(ErdUserHints.of("INVALID", "op 와 필드 이름·값 형식을 확인하세요", null)).isNull();
        assertThat(ErdUserHints.of("INVALID", "restore 값은 getChangesSince 가 준 값을 그대로 쓰세요", null)).isNull();
        assertThat(ErdUserHints.of("INVALID", "getChangesSince 가 준 값을 그대로 쓰세요", null)).isNull();
        assertThat(ErdUserHints.of("INVALID", "logical 값을 JSON 불리언으로 보내세요", null)).isNull();
        assertThat(ErdUserHints.of("INVALID", null, null)).isNull();
        assertThat(ErdUserHints.of("INVALID", "  ", null)).isNull();
    }

    /** 맞는 행이 없는 기계 용어 hint 도 null — 기계 용어를 그대로 내보내지 않는다. */
    @Test
    void unknownMachineHintGivesNull() {
        assertThat(ErdUserHints.of("INVALID", "새로 생긴 hint 인데 baseRev 를 언급한다", null)).isNull();
    }

    /** 엔진·서비스(ErdRejection 의 hint)의 기계 용어 hint 전부(grep 으로 모은 목록). 동적 부분은 예시 값으로 바꿨다. */
    private static final List<String> REAL_HINTS = List.of(
            // ErdCommandService
            "getChangesSince 가 준 rev 를 쓰세요",
            "{\"op\":\"...\", ...} 모양으로 보내세요",
            "되돌리기는 undo(restore 액션)를 쓰세요",
            "op 와 필드 이름·값 형식(숫자·불리언은 따옴표 없이)을 확인하세요",
            "op 와 필드 이름·값 형식을 확인하세요",
            "getChangesSince 로 받은 rev 를 쓰세요",
            "copy 로 새 버전을 먼저 만드세요",
            "소유자(41000132)에게 공동 편집자 등록(execute kind=ADD_EDITOR)을 요청하세요",
            "지금 DRAFT 에서 한 변경만 되돌리세요. getChangesSince 가 reload 를 주면 모델을 다시 읽으세요",
            "getChangesSince 가 reload 를 주면 모델을 다시 읽고(view) 새 rev 를 baseRev 로 다시 보내세요",
            "다시 가져오기 차이는 compare kind=DB_DIFF 로 보세요",
            "compare kind=DB_DIFF 로 차이를 다시 읽고 고르세요",
            "view 가 준 rev 를 쓰세요",
            "compare kind=DB_DIFF 를 읽은 rev 를 쓰세요",
            "import kind=FROM_DB 로 첫 가져오기를 하세요",
            // Ctx
            "restore 값은 getChangesSince 가 준 값을 그대로 쓰세요",
            "getChangesSince(212) 로 최신 값을 읽고 다시 보내세요",
            "logical 값을 JSON 불리언으로 보내세요",
            "getChangesSince 로 최신 모델을 읽으세요",
            "getModelText 로 id 를 확인하세요",
            // ErdCommandEngine
            "op 를 넣으세요",
            "명령 JSON 의 모양과 값 형식을 확인하세요",
            "setPrimaryKey 로 바꾸세요",
            "getChangesSince 가 준 값을 그대로 쓰세요",
            "getChangesSince 로 확인한 뒤 직접 고치세요",
            // ErdIntegrity · ErdDiagramStore · ErdRelationOps
            "getModelText 로 다이어그램을 확인하세요",
            "confirmRelation 또는 updateRelation 으로 기존 관계를 쓰세요");

    @Test
    void userHintNeverLeaksMachineTerms() {
        for (String hint : REAL_HINTS) {
            assertThat(MACHINE.matcher(hint).find()).as("목록은 기계 용어 hint 여야 한다: %s", hint).isTrue();
            for (String code : List.of("INVALID", "CONFLICT", "NOT_FOUND", "NOT_EDITOR", "NEEDS_CHOICE")) {
                String u = ErdUserHints.of(code, hint, "41000132");
                if (u != null) assertThat(MACHINE.matcher(u).find()).as("%s -> %s", hint, u).isFalse();
            }
        }
    }

    @Test
    void jsonCarriesUserHintAndKeepsHint() {
        var r = new ErdRejection("CONFLICT", 0, "m", "getChangesSince(3) 로 최신 값을 읽고 다시 보내세요", "c-1", "logical", 3L, "s", null, null);
        JsonNode j = ErdModelCodec.MAPPER.valueToTree(r);
        assertThat(j.path("hint").asText()).startsWith("getChangesSince(3)");
        assertThat(j.path("userHint").asText()).isEqualTo("화면이 최신 값으로 바뀌었습니다. 확인한 뒤 다시 고치세요.");
    }

    @Test
    void jsonUserHintIsNullForRequestShapeErrors() {
        var r = new ErdRejection("INVALID", 0, "m", "op 를 넣으세요", null, null, null, null, null, null);
        JsonNode j = ErdModelCodec.MAPPER.valueToTree(r);
        assertThat(j.has("userHint")).isTrue();
        assertThat(j.path("userHint").isNull()).isTrue();
    }

    /** NOT_EDITOR 의 소유자 칸이 userHint 로 들어간다. */
    @Test
    void jsonUserHintUsesOwnerId() {
        var r = new ErdRejection("NOT_EDITOR", 0, "m", "소유자(41000132)에게 공동 편집자 등록(execute kind=ADD_EDITOR)을 요청하세요",
                null, null, null, null, null, null, "41000132");
        JsonNode j = ErdModelCodec.MAPPER.valueToTree(r);
        assertThat(j.path("userHint").asText()).isEqualTo("소유자(41000132)에게 공동 편집자 등록을 요청하세요.");
    }
}
