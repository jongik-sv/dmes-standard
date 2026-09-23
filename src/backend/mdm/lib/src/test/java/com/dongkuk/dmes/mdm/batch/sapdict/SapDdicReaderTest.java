package com.dongkuk.dmes.mdm.batch.sapdict;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.mdm.batch.sapdict.SapDdicExtract.Dd03lField;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

/**
 * TSK-04-05 design.md §3.2 — 입력 무결성(§4.1, 불변 규칙 I4·I5·I6·I11). 네 추출 파일의 필수 헤더·활성 행 필터·
 * 키 중복·숫자 칸·한국어 행 선택을 고정한다.
 */
class SapDdicReaderTest {

    private static final String DD03L = "TABNAME,FIELDNAME,ROLLNAME\nZTPP_COIL,ZZ_COIL_ID,ZZDE_COIL_ID\n";
    private static final String DD04L = "ROLLNAME,DOMNAME,DATATYPE,LENG,DECIMALS\nZZDE_COIL_ID,ZZDO_COIL_ID,CHAR,000020,000000\n";
    private static final String DD04T = "ROLLNAME,DDLANGUAGE,DDTEXT,SCRTEXT_S,SCRTEXT_M,SCRTEXT_L\n"
            + "ZZDE_COIL_ID,3,코일 ID,코일ID,코일 ID,코일 아이디\n";
    private static final String DD01L = "DOMNAME,DATATYPE,LENG,DECIMALS,CONVEXIT\nZZDO_COIL_ID,CHAR,000020,000000,ALPHA\n";

    @TempDir
    Path dir;

    private void writeValid() throws IOException {
        write("DD03L.csv", DD03L);
        write("DD04L.csv", DD04L);
        write("DD04T.csv", DD04T);
        write("DD01L.csv", DD01L);
    }

    private void write(String name, String content) throws IOException {
        Files.writeString(dir.resolve(name), content, StandardCharsets.UTF_8);
    }

    private SapDdicExtract read() throws IOException {
        return SapDdicReader.read(dir, StandardCharsets.UTF_8);
    }

    @Test
    void 정상_입력을_읽는다() throws IOException {
        writeValid();

        SapDdicExtract extract = read();

        assertEquals(List.of(new Dd03lField("ZTPP_COIL", "ZZ_COIL_ID", "ZZDE_COIL_ID")), extract.fields());
        assertEquals(20, extract.elements().get("ZZDE_COIL_ID").leng());
        assertEquals("코일 아이디", extract.koreanTexts().get("ZZDE_COIL_ID").scrtextL());
        assertEquals("ALPHA", extract.domains().get("ZZDO_COIL_ID").convexit());
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "DD03L.csv:FIELDNAME", "DD04L.csv:DOMNAME", "DD04T.csv:SCRTEXT_L", "DD01L.csv:CONVEXIT"})
    void 필수_헤더가_없으면_파일_이름과_헤더_이름을_담은_입력_오류다(String fileAndHeader) throws IOException {
        writeValid();
        String file = fileAndHeader.split(":")[0];
        String header = fileAndHeader.split(":")[1];
        String original = Files.readString(dir.resolve(file));
        String headerLine = original.substring(0, original.indexOf('\n'));
        // 필수 헤더 이름만 다른 이름으로 바꿔 칸 수는 그대로 둔다
        write(file, headerLine.replace(header, "ZZ_OTHER") + original.substring(original.indexOf('\n')));

        SapDictInputException e = assertThrows(SapDictInputException.class, this::read);

        assertTrue(e.getMessage().contains(file) && e.getMessage().contains(header), e.getMessage());
    }

    @ParameterizedTest
    @ValueSource(strings = {"DD03L.csv", "DD04L.csv", "DD04T.csv", "DD01L.csv"})
    void 입력_파일이_하나라도_없으면_입력_오류다(String file) throws IOException {
        writeValid();
        Files.delete(dir.resolve(file));

        SapDictInputException e = assertThrows(SapDictInputException.class, this::read);

        assertTrue(e.getMessage().contains(file), e.getMessage());
    }

    @ParameterizedTest
    @ValueSource(strings = {"DD03L", "DD04L", "DD04T", "DD01L"})
    void AS4LOCAL_칸이_있으면_A_행만_남긴다(String table) throws IOException {
        writeValid();
        switch (table) {
            case "DD03L" -> write("DD03L.csv", "TABNAME,FIELDNAME,AS4LOCAL,ROLLNAME\n"
                    + "ZTPP_COIL,ZZ_COIL_ID,N,ZZDE_OLD\n"
                    + "ZTPP_COIL,ZZ_COIL_ID,A,ZZDE_COIL_ID\n"
                    + "ZTPP_COIL,ZZ_COIL_ID,M,ZZDE_MOD\n");
            case "DD04L" -> write("DD04L.csv", "ROLLNAME,AS4LOCAL,DOMNAME,DATATYPE,LENG,DECIMALS\n"
                    + "ZZDE_COIL_ID,N,ZZDO_COIL_ID,CHAR,000099,000000\n"
                    + "ZZDE_COIL_ID,A,ZZDO_COIL_ID,CHAR,000020,000000\n"
                    + "ZZDE_COIL_ID,M,ZZDO_COIL_ID,CHAR,000077,000000\n");
            case "DD04T" -> write("DD04T.csv", "ROLLNAME,DDLANGUAGE,AS4LOCAL,DDTEXT,SCRTEXT_S,SCRTEXT_M,SCRTEXT_L\n"
                    + "ZZDE_COIL_ID,3,N,옛 코일,옛,옛 코일,옛 코일\n"
                    + "ZZDE_COIL_ID,3,A,코일 ID,코일ID,코일 ID,코일 아이디\n"
                    + "ZZDE_COIL_ID,3,M,수정 코일,수정,수정 코일,수정 코일\n");
            case "DD01L" -> write("DD01L.csv", "DOMNAME,AS4LOCAL,DATATYPE,LENG,DECIMALS,CONVEXIT\n"
                    + "ZZDO_COIL_ID,N,CHAR,000099,000000,\n"
                    + "ZZDO_COIL_ID,A,CHAR,000020,000000,ALPHA\n"
                    + "ZZDO_COIL_ID,M,CHAR,000077,000000,\n");
            default -> throw new IllegalArgumentException(table);
        }

        SapDdicExtract extract = read();

        switch (table) {
            case "DD03L" -> assertEquals(List.of(new Dd03lField("ZTPP_COIL", "ZZ_COIL_ID", "ZZDE_COIL_ID")), extract.fields());
            case "DD04L" -> assertEquals(20, extract.elements().get("ZZDE_COIL_ID").leng());
            case "DD04T" -> assertEquals("코일 아이디", extract.koreanTexts().get("ZZDE_COIL_ID").scrtextL());
            case "DD01L" -> assertEquals("ALPHA", extract.domains().get("ZZDO_COIL_ID").convexit());
            default -> throw new IllegalArgumentException(table);
        }
    }

    @Test
    void AS4LOCAL_칸이_없으면_모든_행을_쓴다() throws IOException {
        writeValid();
        write("DD03L.csv", DD03L + "ZTPP_COIL,ZZ_COIL_THK,ZZDE_COIL_THK\n");

        assertEquals(2, read().fields().size());
    }

    @ParameterizedTest
    @ValueSource(strings = {"DD03L", "DD04L", "DD04T", "DD01L"})
    void 활성_행_안에서_키가_중복되면_입력_오류다(String table) throws IOException {
        writeValid();
        switch (table) {
            case "DD03L" -> write("DD03L.csv", DD03L + "ZTPP_COIL,ZZ_COIL_ID,ZZDE_OTHER\n");
            case "DD04L" -> write("DD04L.csv", DD04L + "ZZDE_COIL_ID,ZZDO_COIL_ID,CHAR,000018,000000\n");
            // 언어 키 두 표기(3·KO)가 같은 엘리먼트에 둘 다 있으면 중복이다
            case "DD04T" -> write("DD04T.csv", DD04T + "ZZDE_COIL_ID,KO,코일,코일,코일,코일\n");
            case "DD01L" -> write("DD01L.csv", DD01L + "ZZDO_COIL_ID,CHAR,000018,000000,\n");
            default -> throw new IllegalArgumentException(table);
        }

        SapDictInputException e = assertThrows(SapDictInputException.class, this::read);

        assertTrue(e.getMessage().contains(table), e.getMessage());
    }

    @Test
    void 구조_행은_키_중복_검사_전에_버린다() throws IOException {
        writeValid();
        // 실제 DD03L 은 한 테이블에 .INCLUDE 가 여러 번 나온다
        write("DD03L.csv", DD03L
                + "ZTPP_COIL,.INCLUDE,\n"
                + "ZTPP_COIL,.INCLUDE,\n"
                + "ZTPP_COIL,.APPEND,ZZS_APPEND\n"
                + "ZTPP_COIL,.APPEND,ZZS_APPEND\n");

        SapDdicExtract extract = read();

        assertEquals(List.of(new Dd03lField("ZTPP_COIL", "ZZ_COIL_ID", "ZZDE_COIL_ID")), extract.fields());
    }

    @Test
    void LENG_DECIMALS_는_공백이면_0_이고_앞자리_0_을_읽는다() throws IOException {
        writeValid();
        write("DD04L.csv", "ROLLNAME,DOMNAME,DATATYPE,LENG,DECIMALS\nZZDE_COIL_ID,,CHAR,000020, \n");
        write("DD01L.csv", "DOMNAME,DATATYPE,LENG,DECIMALS,CONVEXIT\nZZDO_COIL_ID,DEC,,000003,\n");

        SapDdicExtract extract = read();

        assertEquals(20, extract.elements().get("ZZDE_COIL_ID").leng());
        assertEquals(0, extract.elements().get("ZZDE_COIL_ID").decimals());
        assertEquals(0, extract.domains().get("ZZDO_COIL_ID").leng());
        assertEquals(3, extract.domains().get("ZZDO_COIL_ID").decimals());
    }

    @ParameterizedTest
    @ValueSource(strings = {"DD04L:LENG", "DD04L:DECIMALS", "DD01L:LENG", "DD01L:DECIMALS"})
    void LENG_DECIMALS_가_숫자가_아니면_입력_오류다(String tableAndColumn) throws IOException {
        writeValid();
        String table = tableAndColumn.split(":")[0];
        String column = tableAndColumn.split(":")[1];
        String lengValue = column.equals("LENG") ? "2A" : "000020";
        String decValue = column.equals("DECIMALS") ? "-1" : "000000";
        if (table.equals("DD04L")) {
            write("DD04L.csv", "ROLLNAME,DOMNAME,DATATYPE,LENG,DECIMALS\nZZDE_COIL_ID,ZZDO_COIL_ID,CHAR,"
                    + lengValue + "," + decValue + "\n");
        } else {
            write("DD01L.csv", "DOMNAME,DATATYPE,LENG,DECIMALS,CONVEXIT\nZZDO_COIL_ID,CHAR,"
                    + lengValue + "," + decValue + ",ALPHA\n");
        }

        SapDictInputException e = assertThrows(SapDictInputException.class, this::read);

        assertTrue(e.getMessage().contains(table) && e.getMessage().contains(column), e.getMessage());
    }

    @Test
    void DD04T_는_언어_키가_3_또는_KO_인_행만_한국어로_남긴다() throws IOException {
        writeValid();
        write("DD04T.csv", "ROLLNAME,DDLANGUAGE,DDTEXT,SCRTEXT_S,SCRTEXT_M,SCRTEXT_L\n"
                + "R_E,E,English,E,E,E\n"
                + "R_EN,EN,English,E,E,E\n"
                + "R_D,D,Deutsch,D,D,D\n"
                + "R_3,3,삼,삼,삼,삼\n"
                + "R_KO, ko ,코,코,코,코\n"
                + "ZZDE_COIL_ID,E,Coil ID,Coil,Coil ID,Coil ID\n");

        SapDdicExtract extract = read();

        assertEquals(Set.of("R_3", "R_KO"), extract.koreanTexts().keySet());
    }
}
