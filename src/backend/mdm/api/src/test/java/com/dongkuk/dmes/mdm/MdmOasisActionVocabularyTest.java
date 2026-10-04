package com.dongkuk.dmes.mdm;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.mdm.contract.screen.MdmScreenGroup;
import com.dongkuk.dmes.mdm.contract.security.MdmActions;
import com.dongkuk.dmes.mdm.contract.security.MdmPermissions;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashSet;
import java.util.Set;
import javax.xml.parsers.DocumentBuilderFactory;
import javax.xml.parsers.ParserConfigurationException;
import org.junit.jupiter.api.Test;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.NodeList;
import org.xml.sax.SAXException;

/**
 * 불변 규칙 I14 정적 검사 — {@code services/dma/unitMng.bpmn}·{@code termMng.bpmn}(TSK-04-02)과
 * {@code services/dme/ruleMng.bpmn}·{@code ruleEdit.bpmn}(TSK-08-02 I23)을 파싱해 {@code actionGateway} 에서 나가는 모든
 * {@code sequenceFlow} 의 {@code name}(액션 이름)이 {@link MdmActions} 16개 상수의 부분집합이고 권한 세트 안에 있는지 단언한다.
 *
 * <p>스프링 컨텍스트 없이 XML 파싱만 하는 순수 단위 테스트다(빠르다). {@code e2e} 스모크1 은
 * {@code search} 하나만 실행하므로 이것만으로는 {@code compare}/{@code execute} 오타를 못 잡는다 —
 * 이 정적 검사가 그 빈틈을 메운다.
 */
class MdmOasisActionVocabularyTest {

    private static final Set<String> ALLOWED_ACTIONS = Set.of(
            MdmActions.SEARCH, MdmActions.VIEW, MdmActions.EXPORT, MdmActions.COMPARE, MdmActions.SAVE,
            MdmActions.DELETE, MdmActions.REG, MdmActions.IMPORT, MdmActions.VALIDATE, MdmActions.EXECUTE,
            MdmActions.COPY, MdmActions.RESTORE, MdmActions.LOCK, MdmActions.UNLOCK, MdmActions.HANDOVER,
            MdmActions.CONFIRM);

    @Test
    void unitMng_bpmn_의_모든_액션이_16개_어휘_안에_있다() throws Exception {
        assertActionsWithinVocabulary(bpmnPath("unitMng.bpmn"));
    }

    @Test
    void termMng_bpmn_의_모든_액션이_16개_어휘_안에_있다() throws Exception {
        assertActionsWithinVocabulary(bpmnPath("termMng.bpmn"));
    }

    @Test
    void dme_ruleEdit_bpmn_의_모든_액션이_어휘와_편집_권한_세트_안에_있다() throws Exception {
        Path path = bpmnPath("dme", "ruleEdit.bpmn");
        assertActionsWithinVocabulary(path);
        assertTrue(new java.util.HashSet<>(MdmPermissions.EDIT_ACTIONS).containsAll(actionsFromGateway(path)), actionsFromGateway(path).toString());
    }

    @Test
    void dme_ruleMng_bpmn_의_모든_액션이_어휘와_편집_권한_세트_안에_있다() throws Exception {
        Path path = bpmnPath("dme", "ruleMng.bpmn");
        assertActionsWithinVocabulary(path);
        assertTrue(new java.util.HashSet<>(MdmPermissions.EDIT_ACTIONS).containsAll(actionsFromGateway(path)), actionsFromGateway(path).toString());
    }

    /** TSK-08-06 I17. */
    @Test
    void dme_ruleSetMng_bpmn_의_모든_액션이_어휘와_편집_권한_세트_안에_있다() throws Exception {
        Path path = bpmnPath("dme", "ruleSetMng.bpmn");
        assertActionsWithinVocabulary(path);
        assertEquals(Set.of("search", "reg"), actionsFromGateway(path));
        assertTrue(new java.util.HashSet<>(MdmPermissions.EDIT_ACTIONS).containsAll(actionsFromGateway(path)), actionsFromGateway(path).toString());
    }

    /** TSK-08-06 I17, 흐름도 2단계 P5(validate·execute), D-144 2단계(copy·lock·unlock·handover). */
    @Test
    void dme_ruleSetEdit_bpmn_의_모든_액션이_어휘와_편집_권한_세트_안에_있다() throws Exception {
        Path path = bpmnPath("dme", "ruleSetEdit.bpmn");
        assertActionsWithinVocabulary(path);
        assertEquals(Set.of("search", "view", "save", "delete", "restore", "validate", "execute", "copy", "lock", "unlock", "handover"),
                actionsFromGateway(path));
        assertTrue(new java.util.HashSet<>(MdmPermissions.EDIT_ACTIONS).containsAll(actionsFromGateway(path)), actionsFromGateway(path).toString());
    }

    /** spec 2026-10-02-mdm-meta-cache-design §3.4 — 메타 제공은 화면이 아니라 업무 모듈 캐시가 부르는 서비스다. action 은 기존 어휘(search·view)를 쓴다. */
    @Test
    void feed_metaFeed_bpmn_의_액션은_어휘_안의_search_view_save_다() throws Exception {
        Path path = bpmnPath("feed", "metaFeed.bpmn");
        assertActionsWithinVocabulary(path);
        assertEquals(Set.of("search", "view", "save"),actionsFromGateway(path));
    }

    /** D-144 2단계 — 룰 세트 확정. confirm 은 CONFIRM 세트에만 있다(ruleConfirm 과 같다). */
    @Test
    void dme_ruleSetConfirm_bpmn_의_모든_액션이_어휘_안에_있다() throws Exception {
        Path path = bpmnPath("dme", "ruleSetConfirm.bpmn");
        assertActionsWithinVocabulary(path);
        assertEquals(Set.of("search", "view", "validate", "confirm"), actionsFromGateway(path));
    }

    @Test
    void unitMng_는_search_save_delete_compare_4개_액션을_쓴다() throws Exception {
        Set<String> actions = actionsFromGateway(bpmnPath("unitMng.bpmn"));
        assertTrue(actions.containsAll(Set.of("search", "save", "delete", "compare")), actions.toString());
        assertFalse(actions.contains("execute"), "unitMng 는 execute 를 쓰지 않는다: " + actions);
    }

    @Test
    void termMng_는_search_save_delete_compare_execute_5개_액션을_쓴다() throws Exception {
        Set<String> actions = actionsFromGateway(bpmnPath("termMng.bpmn"));
        assertTrue(actions.containsAll(Set.of("search", "save", "delete", "compare", "execute")), actions.toString());
    }

    /**
     * TSK-08-02 I23 — mcm 시드({@code CoreRbacSeeder}·{@code MdmMenuSeeder})는 mdm lib 을 의존하지 않아 action 을 문자열로 적는다. PERM_ALL 의 allActions 에
     * 없는 action 은 SYSADMIN 도 403 이고, PERM_MDM_EDIT 문자열이 계약과 어긋나면 역할 사용자가 403 이다. 단위 테스트가 없는
     * 모듈이라 소스 문자열을 읽어 mdm 계약·BPMN 과 대조한다.
     */
    @Test
    void mcm_시드의_allActions_는_mdm_BPMN_의_모든_action_을_담고_editActions_는_계약과_같다() throws Exception {
        String allActionsSource = Files.readString(ALL_ACTIONS_SOURCE);
        int from = allActionsSource.indexOf("String allActions = String.join(\",\",");
        assertTrue(from >= 0, "allActions 선언을 찾지 못했다: " + ALL_ACTIONS_SOURCE.getFileName());
        Set<String> allActions = quoted(allActionsSource.substring(from, allActionsSource.indexOf(");", from)));
        Set<String> bpmnActions = new LinkedHashSet<>();
        Set<String> scanned = new LinkedHashSet<>();
        try (var files = Files.walk(Path.of("src/main/resources/services"))) {
            for (Path bpmn : files.filter(f -> f.toString().endsWith(".bpmn")).toList()) {
                bpmnActions.addAll(actionsFromGateway(bpmn));
                scanned.add(bpmn.getParent().getFileName() + "/" + bpmn.getFileName());
            }
        }
        assertTrue(scanned.containsAll(Set.of("dme/ruleMng.bpmn", "dme/ruleEdit.bpmn", "dme/ruleSetMng.bpmn", "dme/ruleSetEdit.bpmn", "dme/ruleSetConfirm.bpmn")),
                "dme BPMN 이 스캔되지 않았다: " + scanned);
        Set<String> missing = new LinkedHashSet<>(bpmnActions);
        missing.removeAll(allActions);
        assertEquals(Set.of(), missing, "mcm CoreRbacSeeder allActions 에 없는 mdm BPMN action");

        String seederSource = Files.readString(MDM_MENU_SEEDER_SOURCE);
        java.util.regex.Matcher read = java.util.regex.Pattern.compile("String readActions = \"([^\"]*)\";").matcher(seederSource);
        java.util.regex.Matcher edit = java.util.regex.Pattern.compile("String editActions = readActions \\+ \"([^\"]*)\";").matcher(seederSource);
        assertTrue(read.find() && edit.find(), "readActions·editActions 선언을 찾지 못했다: " + MDM_MENU_SEEDER_SOURCE.getFileName());
        assertEquals(String.join(",", MdmPermissions.READ_ACTIONS), read.group(1));
        assertEquals(String.join(",", MdmPermissions.EDIT_ACTIONS), read.group(1) + edit.group(1));
    }

    /** design.md B1 (i)-1 — 기존 시험은 readActions·editActions 까지만 본다. confirmActions 까지 마저 본다. */
    @Test
    void mcm_시드의_confirmActions_는_MdmPermissions_CONFIRM_ACTIONS_와_같다() throws Exception {
        String source = Files.readString(MDM_MENU_SEEDER_SOURCE);
        java.util.regex.Matcher read = java.util.regex.Pattern.compile("String readActions = \"([^\"]*)\";").matcher(source);
        java.util.regex.Matcher edit = java.util.regex.Pattern.compile("String editActions = readActions \\+ \"([^\"]*)\";").matcher(source);
        java.util.regex.Matcher confirm = java.util.regex.Pattern.compile("String confirmActions = editActions \\+ \"([^\"]*)\";").matcher(source);
        assertTrue(read.find() && edit.find() && confirm.find(), "readActions·editActions·confirmActions 선언을 찾지 못했다");
        String editValue = read.group(1) + edit.group(1);
        String confirmValue = editValue + confirm.group(1);
        assertEquals(String.join(",", MdmPermissions.CONFIRM_ACTIONS), confirmValue);
    }

    @Test
    void layoutConfirm_메뉴가_dmb_아래_시드된다() throws Exception {
        String seed = Files.readString(MDM_MENU_SEEDER_SOURCE);
        assertTrue(seed.contains("insertMcmSecMenuIfAbsent(\"layoutConfirm\", \"003\", \"5020130\", \"레이아웃 확정\", \"dmb\", \"layoutConfirm\")"));
        assertTrue(seed.contains("seedMdmObjectRbac(\"layoutConfirm\", \"dmb\")"));
    }

    /**
     * design.md B1 (i)-2 — {@code seedMdmObjectRbac} 의 {@code matrix} 리터럴(그룹 × 역할 → PERM ID)을 정규식으로 파싱해
     * {@link MdmPermissions#MATRIX} 5그룹 모두와 대조한다.
     */
    @Test
    void mcm_시드의_그룹_역할_매트릭스는_MdmPermissions_MATRIX_와_같다() throws Exception {
        String source = Files.readString(MDM_MENU_SEEDER_SOURCE);
        String marker = "java.util.Map<String, java.util.Map<String, String>> matrix = java.util.Map.of";
        int markerIdx = source.indexOf(marker);
        assertTrue(markerIdx >= 0, "seedMdmObjectRbac 의 matrix 선언을 찾지 못했다");
        int openParen = source.indexOf('(', markerIdx + marker.length());
        String matrixBody = extractBalancedParens(source, openParen);

        java.util.Map<String, java.util.Map<String, String>> parsed = new java.util.LinkedHashMap<>();
        java.util.regex.Matcher group = java.util.regex.Pattern.compile("\"([a-z]+)\",\\s*java\\.util\\.Map\\.of\\(").matcher(matrixBody);
        while (group.find()) {
            String inner = extractBalancedParens(matrixBody, group.end() - 1);
            java.util.Map<String, String> byRole = new java.util.LinkedHashMap<>();
            java.util.regex.Matcher kv = java.util.regex.Pattern.compile("\"([A-Z_]+)\",\\s*\"([A-Z_]+)\"").matcher(inner);
            while (kv.find()) {
                byRole.put(kv.group(1), kv.group(2));
            }
            parsed.put(group.group(1), byRole);
        }

        assertEquals(MdmScreenGroup.values().length, parsed.size(), "시드 matrix 의 그룹 수: " + parsed.keySet());
        for (MdmScreenGroup screenGroup : MdmScreenGroup.values()) {
            assertEquals(MdmPermissions.MATRIX.get(screenGroup), parsed.get(screenGroup.code()),
                    "그룹 " + screenGroup.code() + " 의 역할→권한 매핑이 다르다");
        }
    }

    /**
     * design.md B1 (i)-3 — BPMN 26개(`find src/main/resources/services -iname "*.bpmn"`, D-144 2단계 ruleSetConfirm·3단계 layoutConfirm·메타 캐시 metaFeed 포함) 중
     * metaFeed 를 뺀 화면 목록과 mcm
     * {@code MdmMenuSeeder} 의 모든 {@code seedMdmObjectRbac(...)} 호출에서 뽑은 objectId 목록을 대조한다.
     * {@code mdmSample} 은 BPMN 없는 샘플 화면이라 예외로 둔다(원천이 원래 다르다).
     */
    @Test
    void mcm_시드가_BPMN_26개_화면을_모두_커버한다() throws Exception {
        String source = Files.readString(MDM_MENU_SEEDER_SOURCE);
        Set<String> bpmnScreens = new LinkedHashSet<>();
        try (var files = Files.walk(Path.of("src/main/resources/services"))) {
            for (Path bpmn : files.filter(f -> f.toString().endsWith(".bpmn")).toList()) {
                String name = bpmn.getFileName().toString();
                bpmnScreens.add(name.substring(0, name.length() - ".bpmn".length()));
            }
        }
        assertEquals(26, bpmnScreens.size(), "BPMN 수가 26개가 아니다(늘거나 줄었으면 이 상수를 갱신한다): " + bpmnScreens);
        // metaFeed(services/feed) 는 화면이 아니라 업무 모듈 캐시가 부르는 서비스다 — 그룹 RBAC(seedMdmObjectRbac)를 받지 않고
        // SYSADMIN 전용 OBJECT 로만 시드한다(Task 11 의 seedMdmCacheMenus). spec 2026-10-02-mdm-meta-cache-design §5.5·§9.
        bpmnScreens.remove("metaFeed");
        assertTrue(source.contains("insertMcmSecObjIfAbsent(\"metaFeed\", "),
                "metaFeed OBJECT(SYSTEM_CODE=mdm, SYSADMIN 전용) 시드가 없다 — BFF 권한키 mdm/metafeed/save 가 없어 화면 삭제·재등록이 403 이다");

        Set<String> seeded = objectIdsFromSeedCalls(source);
        Set<String> missing = new LinkedHashSet<>(bpmnScreens);
        missing.removeAll(seeded);
        assertEquals(Set.of(), missing, "BPMN 에 있는데 mcm 시드 RBAC(seedMdmObjectRbac) 호출이 없는 화면: " + missing);

        Set<String> extra = new LinkedHashSet<>(seeded);
        extra.removeAll(bpmnScreens);
        extra.remove("mdmSample");
        assertEquals(Set.of(), extra, "시드에는 있는데 BPMN 에 없는 화면(원천이 다르면 의도된 것이니 design.md 를 확인한다): " + extra);
    }

    /** {@code Map.of(} 처럼 여는 괄호부터 짝이 맞는 닫는 괄호까지(양끝 제외) 잘라낸다. */
    private static String extractBalancedParens(String source, int openParenIdx) {
        int depth = 0;
        for (int i = openParenIdx; i < source.length(); i++) {
            char c = source.charAt(i);
            if (c == '(') {
                depth++;
            } else if (c == ')') {
                depth--;
                if (depth == 0) {
                    return source.substring(openParenIdx + 1, i);
                }
            }
        }
        throw new IllegalStateException("괄호 짝을 찾지 못했다: " + openParenIdx);
    }

    /** 여는 중괄호부터 짝이 맞는 닫는 중괄호까지(양끝 포함) 잘라낸다. */
    private static String extractBracedBlock(String source, int openBraceIdx) {
        int depth = 0;
        for (int i = openBraceIdx; i < source.length(); i++) {
            char c = source.charAt(i);
            if (c == '{') {
                depth++;
            } else if (c == '}') {
                depth--;
                if (depth == 0) {
                    return source.substring(openBraceIdx, i + 1);
                }
            }
        }
        throw new IllegalStateException("중괄호 짝을 찾지 못했다: " + openBraceIdx);
    }

    /**
     * mcm {@code MdmMenuSeeder} 의 {@code seedMdmObjectRbac(...)} 호출에서 objectId 를 모두 뽑는다(design.md B1 (i)-3,
     * 세 모양). ① 리터럴 {@code seedMdmObjectRbac("codeConfirm", "dmc")} ② 배열 루프 {@code for (String objectId : new
     * String[]{"a","b"}) { ...; seedMdmObjectRbac(objectId, "dma"); }} ③ 2차원 배열 루프 {@code String[][] screens =
     * {{"a",...}, ...}; for (String[] screen : screens) { String objectId = screen[0]; ...; seedMdmObjectRbac(objectId,
     * "dme"); }}.
     */
    private static Set<String> objectIdsFromSeedCalls(String source) {
        Set<String> ids = new LinkedHashSet<>();

        java.util.regex.Matcher literal = java.util.regex.Pattern.compile(
                "seedMdmObjectRbac\\(\"([a-zA-Z]+)\",\\s*\"[a-z]+\"\\)").matcher(source);
        while (literal.find()) {
            ids.add(literal.group(1));
        }

        java.util.regex.Matcher arrayLoop = java.util.regex.Pattern.compile(
                "for \\(String objectId : new String\\[\\]\\{([^}]*)\\}\\)\\s*(\\{)").matcher(source);
        while (arrayLoop.find()) {
            String block = extractBracedBlock(source, arrayLoop.start(2));
            if (block.contains("seedMdmObjectRbac(objectId,")) {
                java.util.regex.Matcher items = java.util.regex.Pattern.compile("\"([a-zA-Z]+)\"").matcher(arrayLoop.group(1));
                while (items.find()) {
                    ids.add(items.group(1));
                }
            }
        }

        java.util.regex.Matcher arr2dDecl = java.util.regex.Pattern.compile("String\\[\\]\\[\\] (\\w+) = (\\{)").matcher(source);
        while (arr2dDecl.find()) {
            String varName = arr2dDecl.group(1);
            String arrLiteral = extractBracedBlock(source, arr2dDecl.start(2));
            if (source.contains("for (String[] screen : " + varName + ")")) {
                java.util.regex.Matcher rowMatcher = java.util.regex.Pattern.compile("\\{\\s*\"([a-zA-Z]+)\"").matcher(arrLiteral);
                while (rowMatcher.find()) {
                    ids.add(rowMatcher.group(1));
                }
            }
        }
        return ids;
    }

    /** mcm 시드 소스 폴더. 시험이 읽는 파일은 아래 상수에 이름으로 적는다(폴더 전체를 훑지 않는다). */
    private static final Path MCM_INIT = Path.of("../../mcm/api/src/main/java/com/dongkuk/dmes/mcm/init");

    /** PERM_ALL 의 {@code String allActions = String.join(",", ...)} 선언이 있는 파일. */
    private static final Path ALL_ACTIONS_SOURCE = MCM_INIT.resolve("seed/CoreRbacSeeder.java");

    /**
     * MdmMenuSeeder 가 있는 파일 — {@code readActions}·{@code editActions}·{@code confirmActions}·{@code matrix} 선언,
     * 세 모양의 {@code seedMdmObjectRbac(...)} 호출, metaFeed OBJECT·layoutConfirm 메뉴 시드를 여기서 찾는다.
     */
    private static final Path MDM_MENU_SEEDER_SOURCE = MCM_INIT.resolve("seed/MdmMenuSeeder.java");

    private static Set<String> quoted(String text) {
        Set<String> out = new LinkedHashSet<>();
        java.util.regex.Matcher m = java.util.regex.Pattern.compile("\"([^\"]+)\"").matcher(text);
        while (m.find()) {
            out.add(m.group(1));
        }
        return out;
    }

    private void assertActionsWithinVocabulary(Path bpmnFile) throws Exception {
        Set<String> actions = actionsFromGateway(bpmnFile);
        assertFalse(actions.isEmpty(), bpmnFile + " 에서 액션을 하나도 찾지 못했다 — 파싱 로직을 확인하라.");
        assertTrue(ALLOWED_ACTIONS.containsAll(actions),
                bpmnFile + " 의 액션이 MdmActions 16개 어휘 밖이다: " + actions);
    }

    /** {@code actionGateway} 에서 나가는(sourceRef=actionGateway) sequenceFlow 들의 name 집합. */
    private Set<String> actionsFromGateway(Path bpmnFile) throws IOException, ParserConfigurationException, SAXException {
        DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
        factory.setNamespaceAware(true); // getElementsByTagNameNS 가 매치하려면 필수.
        Document doc = factory.newDocumentBuilder().parse(bpmnFile.toFile());
        Set<String> actions = new LinkedHashSet<>();
        NodeList flows = doc.getElementsByTagNameNS("*", "sequenceFlow");
        for (int i = 0; i < flows.getLength(); i++) {
            Element flow = (Element) flows.item(i);
            if ("actionGateway".equals(flow.getAttribute("sourceRef"))) {
                String name = flow.getAttribute("name");
                if (name != null && !name.isBlank()) {
                    actions.add(name);
                }
            }
        }
        return actions;
    }

    private Path bpmnPath(String fileName) {
        return bpmnPath("dma", fileName);
    }

    private Path bpmnPath(String group, String fileName) {
        Path path = Path.of("src/main/resources/services", group, fileName);
        assertTrue(Files.isRegularFile(path), path.toAbsolutePath() + " 가 없다");
        return path;
    }
}
