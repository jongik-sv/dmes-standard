package com.dongkuk.dmes.mdm.dmd;

import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.mdm.common.segment.DataItemMessages;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

/**
 * TSK-07-03 design.md A2 — 화면이 {@code meta.message} 로 충돌·닫힌 키 등을 가리므로(F12) 서버 문구와 화면 상수(각 화면의
 * {@code messages.ts})가 같은 글자여야 한다. 한쪽만 바꾸면 이 테스트가 빨강이다. TSK-07-02 design.md §2 「수정 — 공유
 * 파일」에 따라 화면 목록 루프로 바꿨다 — B2 가 루프 구조를 만들고(dataItemMng·dataEdit 은 {@code ROW_VERSION_CONFLICT}
 * 접두어를 대조), 통합 단위(I)가 dataCateEdit 항목을 더했다(이 화면은 접두어 상수 이름 자체가 달라 {@code
 * prefixConstant}·{@code expectedPrefix} 를 화면마다 고를 수 있게 {@link Case} 를 넓혔다 — dataCateEdit 은
 * {@code RESERVED_CATEGORY_PREFIX} 를 {@code MdmErrorCode.RESERVED_CATEGORY} 와 대조하고, 닫힌 키 재등록 문구도 쓴다).
 *
 * <p>파일은 {@code api} 프로젝트 디렉터리 기준 상대 경로로 읽는다(Gradle 테스트 작업 디렉터리 = 프로젝트 디렉터리).
 */
class DmdScreenMessageParityTest {

    /**
     * 화면 하나의 판정 대상. {@code prefixConstant}·{@code expectedPrefix} 로 접두어 문구를 어느 화면 상수와 어느
     * 서버 기본 문구로 대조할지 고른다(화면마다 판정 종류가 다를 수 있다 — MDM001 vs MDM012). {@code
     * checkClosedKeyReopen} 이 있는 화면만 {@code CLOSED_KEY_REOPEN} 도 대조한다.
     */
    private record Case(String screen, Path messages, String prefixConstant, String expectedPrefix, boolean checkClosedKeyReopen) {
    }

    private static Stream<Arguments> screens() {
        return Stream.of(
                Arguments.of(new Case("dataItemMng", Path.of("../../../frontend/m-mdm/pages/dmd/dataItemMng/messages.ts"),
                        "ROW_VERSION_CONFLICT_PREFIX", MdmErrorCode.ROW_VERSION_CONFLICT.defaultMessage(), true)),
                Arguments.of(new Case("dataEdit", Path.of("../../../frontend/m-mdm/pages/dmd/dataEdit/messages.ts"),
                        "ROW_VERSION_CONFLICT_PREFIX", MdmErrorCode.ROW_VERSION_CONFLICT.defaultMessage(), false)),
                Arguments.of(new Case("dataCateEdit", Path.of("../../../frontend/m-mdm/pages/dmd/dataCateEdit/messages.ts"),
                        "RESERVED_CATEGORY_PREFIX", MdmErrorCode.RESERVED_CATEGORY.defaultMessage(), true)));
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("screens")
    void 화면_판정_상수는_서버_문구와_같은_글자다(Case c) throws Exception {
        assertTrue(Files.exists(c.messages()), c.messages().toAbsolutePath() + " 가 없다");
        String ts = Files.readString(c.messages(), StandardCharsets.UTF_8);

        String prefix = constant(ts, c.prefixConstant());
        assertTrue(!prefix.isEmpty() && c.expectedPrefix().startsWith(prefix),
                c.screen() + " — " + c.prefixConstant() + " 접두어가 서버 기본 문구의 앞부분이 아니다: " + prefix);

        if (c.checkClosedKeyReopen()) {
            assertTrue(DataItemMessages.CLOSED_KEY_REOPEN.equals(constant(ts, "CLOSED_KEY_REOPEN")),
                    c.screen() + " — 닫힌 키 안내 문구가 서버와 다르다");
        }
    }

    private static String constant(String ts, String name) {
        Matcher m = Pattern.compile("export const " + name + " = \"([^\"]*)\"").matcher(ts);
        assertTrue(m.find(), name + " 상수를 찾지 못했다");
        return m.group(1);
    }
}
