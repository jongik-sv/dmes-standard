package com.dongkuk.dmes.mdm.dma.naming;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * TSK-04-04 design.md §3.2 F1~F9·R1~R4 — 한국어 → 물리명 분해와 물리명 → 논리명 역분해(불변 규칙 I1~I8·I23).
 */
class ColumnNameComposerTest {

    private final ColumnNameComposer composer = new ColumnNameComposer(NamingFixtures.defaultDictionary());

    @Test
    void F1_띄어쓰기와_붙여_쓴_덩어리를_나눠_약어를_밑줄로_잇는다() {
        NameComposition c = composer.forward("원재료 코일두께");

        assertEquals(List.of("원재료", "코일", "두께"), surfaces(c));
        assertTrue(c.tokens().stream().allMatch(t -> t.status() == TokenStatus.MATCHED));
        assertEquals("RMTL_COIL_THK", c.physName());
        assertEquals("원재료 코일 두께", c.logicalName());
        assertFalse(c.placeholder());
        assertEquals(Direction.FORWARD, c.direction());
        assertEquals(List.of(1, 2, 3), c.tokens().stream().map(NameToken::seq).toList());
    }

    @Test
    void F2_미등록_토큰은_자리_표시자가_된다() {
        NameComposition c = composer.forward("원재료 코일두께 편차");

        NameToken last = c.tokens().get(3);
        assertEquals(TokenStatus.UNKNOWN, last.status());
        assertEquals("편차", last.surface());
        assertEquals("***", last.abbr());
        assertNull(last.selected());
        assertEquals("RMTL_COIL_THK_***", c.physName());
        assertEquals("원재료 코일 두께 편차", c.logicalName());
        assertTrue(c.placeholder());
    }

    @Test
    void F3_왼쪽부터_최장_일치() {
        NameComposition c = composer.forward("원재료코일");

        assertEquals(List.of("원재료", "코일"), surfaces(c));
        assertEquals("RMTL_COIL", c.physName());
    }

    @Test
    void F4_동의어는_표준_용어로_치환한다() {
        NameComposition c = composer.forward("원자재 두께");

        NameToken first = c.tokens().get(0);
        assertEquals(TokenStatus.SYNONYM, first.status());
        assertEquals("원자재", first.surface());
        assertEquals("원재료", first.selected().termName());
        assertEquals("RMTL", first.abbr());
        assertEquals("원재료 두께", c.logicalName());
        assertEquals("RMTL_THK", c.physName());
    }

    @Test
    void F5_여러_용어의_동의어면_AMBIGUOUS_이고_정렬_첫째를_고른다() {
        NameComposition c = composer.forward("배치");

        NameToken token = c.tokens().get(0);
        assertEquals(TokenStatus.AMBIGUOUS, token.status());
        assertEquals(List.of(3L, 4L), token.candidates().stream().map(x -> x.term().termId()).toList());
        assertEquals("코일", token.selected().termName());
        assertEquals("COIL", c.physName());
        assertFalse(c.placeholder());
    }

    @Test
    void F5b_정렬은_via_다음_senseNo_다음_termId() {
        TermDictionary dict = TermDictionary.of(List.of(
                new TermEntry(9L, "배치", 2, "d", null, null, "BAT2", null, null),
                new TermEntry(8L, "로트", 1, "d", null, null, "LOT", "[\"배치\"]", null),
                new TermEntry(7L, "배치", 1, "d", null, null, "BAT", null, null),
                new TermEntry(6L, "묶음", 1, "d", null, null, "BND", null, "[\"배치\"]")));

        NameToken token = new ColumnNameComposer(dict).forward("배치").tokens().get(0);

        assertEquals(List.of(7L, 9L, 8L, 6L), token.candidates().stream().map(x -> x.term().termId()).toList());
        assertEquals(7L, token.selected().termId());
    }

    @Test
    void F6_빈_사전에서도_예외_없이_모두_UNKNOWN() {
        NameComposition c = new ColumnNameComposer(TermDictionary.of(List.of())).forward("원재료 코일두께");

        assertEquals(List.of("원재료", "코일두께"), surfaces(c));
        assertTrue(c.tokens().stream().allMatch(t -> t.status() == TokenStatus.UNKNOWN));
        assertEquals("***_***", c.physName());
        assertTrue(c.placeholder());
    }

    @Test
    void F7_한글_영숫자_밖의_문자는_덩어리_구분자다() {
        NameComposition c = composer.forward("두께(mm)/코일");

        assertEquals(List.of("두께", "mm", "코일"), surfaces(c));
        assertEquals("THK_***_COIL", c.physName());
    }

    @Test
    void F8a_미등록_구간은_다음_표면형_시작_직전까지() {
        NameComposition c = composer.forward("편차두께");

        assertEquals(List.of("편차", "두께"), surfaces(c));
        assertEquals(TokenStatus.UNKNOWN, c.tokens().get(0).status());
        assertEquals(TokenStatus.MATCHED, c.tokens().get(1).status());
    }

    @Test
    void F8b_사전에_차가_있으면_편만_미등록() {
        NameComposition c = new ColumnNameComposer(NamingFixtures.withCha()).forward("편차두께");

        assertEquals(List.of("편", "차", "두께"), surfaces(c));
        assertEquals(List.of(TokenStatus.UNKNOWN, TokenStatus.MATCHED, TokenStatus.MATCHED),
                c.tokens().stream().map(NameToken::status).toList());
        assertEquals("***_CHA_THK", c.physName());
    }

    @Test
    void F9_약어_없는_용어는_NO_ABBR_이고_자리_표시자() {
        NameComposition c = composer.forward("편성 두께");

        NameToken first = c.tokens().get(0);
        assertEquals(TokenStatus.NO_ABBR, first.status());
        assertEquals("편성", first.selected().termName());
        assertEquals("***", first.abbr());
        assertEquals("***_THK", c.physName());
        assertEquals("편성 두께", c.logicalName());
        assertTrue(c.placeholder());
    }

    @Test
    void 영문_덩어리는_대문자로_비교한다() {
        NameComposition c = composer.forward("코일id");

        assertEquals(TokenStatus.MATCHED, c.tokens().get(0).status());
        assertEquals("코일id", c.tokens().get(0).surface());
        assertEquals("COIL", c.physName());
    }

    @Test
    void R1_역분해() {
        NameComposition c = composer.reverse("RMTL_COIL_THK");

        assertEquals(Direction.REVERSE, c.direction());
        assertEquals(List.of("원재료", "코일", "두께"),
                c.tokens().stream().map(t -> t.selected().termName()).toList());
        assertEquals("원재료 코일 두께", c.logicalName());
        assertEquals("RMTL_COIL_THK", c.physName());
        assertFalse(c.placeholder());
    }

    @Test
    void R2_여러_조각_약어까지_최장_일치() {
        NameComposition c = composer.reverse("ANN_BATCH_ID");

        assertEquals(List.of("ANN_BATCH", "ID"), surfaces(c));
        assertEquals("소둔배치 아이디", c.logicalName());
    }

    @Test
    void R3_분해가_안_되는_조각은_자리_표시자() {
        NameComposition c = composer.reverse("RMTL_COIL_THK_DEV");

        NameToken last = c.tokens().get(3);
        assertEquals(TokenStatus.UNKNOWN, last.status());
        assertEquals("DEV", last.surface());
        assertEquals("원재료 코일 두께 ***", c.logicalName());
        assertEquals("RMTL_COIL_THK_DEV", c.physName());
        assertTrue(c.placeholder());
    }

    @Test
    void R4_대소문자와_앞뒤_공백을_정규화한다() {
        NameComposition c = composer.reverse(" rmtl_coil_thk ");

        assertEquals("원재료 코일 두께", c.logicalName());
        assertEquals("RMTL_COIL_THK", c.physName());
    }

    @Test
    void 빈_사전_역분해도_예외_없다() {
        NameComposition c = new ColumnNameComposer(TermDictionary.of(List.of())).reverse("CHARG");

        assertEquals("***", c.logicalName());
        assertTrue(c.placeholder());
    }

    private static List<String> surfaces(NameComposition c) {
        return c.tokens().stream().map(NameToken::surface).toList();
    }
}
