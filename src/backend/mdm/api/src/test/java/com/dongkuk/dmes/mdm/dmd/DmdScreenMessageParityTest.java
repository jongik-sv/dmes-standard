package com.dongkuk.dmes.mdm.dmd;

import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.mdm.common.segment.DataItemMessages;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.junit.jupiter.api.Test;

/**
 * TSK-07-03 design.md A2 — 화면이 {@code meta.message} 로 충돌·닫힌 키를 가리므로(F12) 서버 문구와 화면 상수
 * ({@code m-mdm/pages/dmd/dataItemMng/messages.ts})가 같은 글자여야 한다. 한쪽만 바꾸면 이 테스트가 빨강이다.
 * 파일은 {@code api} 프로젝트 디렉터리 기준 상대 경로로 읽는다(Gradle 테스트 작업 디렉터리 = 프로젝트 디렉터리).
 */
class DmdScreenMessageParityTest {

    private static final Path MESSAGES = Path.of("../../../frontend/m-mdm/pages/dmd/dataItemMng/messages.ts");

    @Test
    void 화면_판정_상수는_서버_문구와_같은_글자다() throws Exception {
        assertTrue(Files.exists(MESSAGES), MESSAGES.toAbsolutePath() + " 가 없다");
        String ts = Files.readString(MESSAGES, StandardCharsets.UTF_8);

        String prefix = constant(ts, "ROW_VERSION_CONFLICT_PREFIX");
        assertTrue(!prefix.isEmpty() && MdmErrorCode.ROW_VERSION_CONFLICT.defaultMessage().startsWith(prefix),
                "충돌 문구 접두어가 서버 기본 문구의 앞부분이 아니다: " + prefix);
        assertTrue(DataItemMessages.CLOSED_KEY_REOPEN.equals(constant(ts, "CLOSED_KEY_REOPEN")),
                "닫힌 키 안내 문구가 서버와 다르다");
    }

    private static String constant(String ts, String name) {
        Matcher m = Pattern.compile("export const " + name + " = \"([^\"]*)\"").matcher(ts);
        assertTrue(m.find(), name + " 상수를 찾지 못했다");
        return m.group(1);
    }
}
