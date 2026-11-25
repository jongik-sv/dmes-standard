package com.dongkuk.dmes.mqc.qdm.qualitySpec.engine;

import com.dongkuk.dmes.mqc.qdm.qualitySpec.domain.QualitySpecAttr;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;

/**
 * 품질사양 한 줄 문장 해석기 — "조건 = 값, … | 설계결과 = 값, …". 화면(m-mqc qualitySpec/dsl.ts)과 같은 규칙이다.
 * <ul>
 *   <li>첫 '|' 앞이 조건, 뒤가 설계결과. 항목은 쉼표로 나누고 따옴표 안의 쉼표는 나누지 않는다.</li>
 *   <li>연산자는 &gt;=(≥) · &lt;=(≤) · ≥ · ≤ · = · &gt; · &lt; 순으로 찾는다. 연산자가 없으면 사전 항목명 중 가장 긴 앞머리를 쓴다("원재료 두께 1.2").</li>
 *   <li>값이 n~m 이면 범위(~). 값 앞뒤 따옴표는 뗀다.</li>
 *   <li>항목은 한글명(공백 무시) 또는 시스템 코드(대소문자 무시)로 찾고, 사용 중인 항목만 알아본다.</li>
 *   <li>오류: 모르는 표현, 빈 값, 조건 없음, '|' 뒤 결과 없음, 고객사·품명 없음(채번 기준). 경고: 사전에 없는 항목, 조건·결과 자리 바뀜, '|' 없음.</li>
 * </ul>
 */
public final class SpecDsl {

    private static final String[][] OPS = {{">=", "≥"}, {"<=", "≤"}, {"≥", "≥"}, {"≤", "≤"}, {"=", "="}, {">", ">"}, {"<", "<"}};
    private static final Pattern RANGE = Pattern.compile("^-?[\\d.]+\\s*~\\s*-?[\\d.]+$");
    private static final Pattern WS = Pattern.compile("(?U)\\s+");
    private static final Pattern QUOTES = Pattern.compile("^['\"]|['\"]$");

    public static final String CUS_CD = "CUS_CD";
    public static final String PRD_NM_CD = "PRD_NM_CD";

    private SpecDsl() {}

    public enum Level { ERR, WARN }

    public record Issue(Level level, String msg, String name, boolean quickAdd, String kindGuess) {
        static Issue err(String msg) { return new Issue(Level.ERR, msg, null, false, null); }
        static Issue warn(String msg) { return new Issue(Level.WARN, msg, null, false, null); }
    }

    /** 해석한 항목 하나. attr 가 null 이면 사전에 없는 항목이다. */
    public record Token(String attrNm, String op, String val, QualitySpecAttr attr, List<Issue> issues) {
        public String attrCd() { return attr == null ? null : attr.getAttrCd(); }
        public String unit() { return attr == null ? null : attr.getUnit(); }
    }

    public record Line(String raw, List<Token> conds, List<Token> results, List<Issue> issues, String cus, String prd) {
        public boolean ok() { return issues.stream().noneMatch(i -> i.level() == Level.ERR); }
        public boolean mapped() {
            return conds.stream().allMatch(t -> t.attr() != null) && results.stream().allMatch(t -> t.attr() != null);
        }
        public List<String> errors() { return issues.stream().filter(i -> i.level() == Level.ERR).map(Issue::msg).toList(); }
    }

    public static String norm(String s) { return s == null ? "" : WS.matcher(s).replaceAll(""); }

    public static Line parseLine(String text, List<QualitySpecAttr> dict) {
        List<Issue> issues = new ArrayList<>();
        int pi = text.indexOf('|');
        String left = pi >= 0 ? text.substring(0, pi) : text;
        String right = pi >= 0 ? text.substring(pi + 1) : "";
        if (pi < 0) issues.add(Issue.warn("'|' 구분자가 없습니다 — 전체를 조건으로 해석합니다. '|' 뒤에 설계결과를 입력하세요"));
        List<Token> conds = splitTokens(left).stream().map(t -> parseToken(t, dict, QualitySpecAttr.COND)).toList();
        List<Token> results = splitTokens(right).stream().map(t -> parseToken(t, dict, QualitySpecAttr.RESULT)).toList();
        conds.forEach(t -> issues.addAll(t.issues()));
        results.forEach(t -> issues.addAll(t.issues()));
        if (conds.isEmpty()) issues.add(Issue.err("조건이 없습니다"));
        if (pi >= 0 && results.isEmpty()) issues.add(Issue.err("'|' 뒤에 설계결과가 없습니다"));
        Token cus = conds.stream().filter(c -> CUS_CD.equals(c.attrCd())).findFirst().orElse(null);
        Token prd = conds.stream().filter(c -> PRD_NM_CD.equals(c.attrCd())).findFirst().orElse(null);
        if (cus == null) issues.add(Issue.err("조건에 고객사가 필요합니다 (채번 기준)"));
        if (prd == null) issues.add(Issue.err("조건에 품명이 필요합니다 (채번 기준)"));
        return new Line(text.trim(), conds, results, issues, cus == null ? null : cus.val(), prd == null ? null : prd.val());
    }

    static List<String> splitTokens(String side) {
        List<String> out = new ArrayList<>();
        StringBuilder cur = new StringBuilder();
        boolean q = false;
        for (int i = 0; i < side.length(); i++) {
            char ch = side.charAt(i);
            if (ch == '\'' || ch == '"') { q = !q; cur.append(ch); continue; }
            if (ch == ',' && !q) {
                if (!cur.toString().trim().isEmpty()) out.add(cur.toString().trim());
                cur.setLength(0);
                continue;
            }
            cur.append(ch);
        }
        if (!cur.toString().trim().isEmpty()) out.add(cur.toString().trim());
        return out;
    }

    static String stripQ(String v) { return QUOTES.matcher(v).replaceAll("").trim(); }

    static QualitySpecAttr findAttr(String name, List<QualitySpecAttr> dict) {
        String n = norm(name);
        for (QualitySpecAttr a : dict) if (a.isActive() && norm(a.getAttrNm()).equals(n)) return a;
        String code = name.trim().toUpperCase();
        for (QualitySpecAttr a : dict) if (a.isActive() && a.getAttrCd().toUpperCase().equals(code)) return a;
        return null;
    }

    static Token parseToken(String token, List<QualitySpecAttr> dict, String sideKind) {
        for (String[] op : OPS) {
            int idx = token.indexOf(op[0]);
            if (idx > 0) {
                String name = token.substring(0, idx).trim();
                String val = stripQ(token.substring(idx + op[0].length()).trim());
                return finish(name, op[1], val, findAttr(name, dict), sideKind);
            }
        }
        String nt = norm(token);
        QualitySpecAttr best = null;
        for (QualitySpecAttr a : dict) {
            if (!a.isActive()) continue;
            String an = norm(a.getAttrNm());
            if (nt.startsWith(an) && (best == null || an.length() > norm(best.getAttrNm()).length())) best = a;
        }
        if (best != null) {
            int need = norm(best.getAttrNm()).length();
            StringBuilder rest = new StringBuilder();
            int seen = 0;
            // 원문에서 항목명 글자(공백 제외)만큼 건너뛰고 나머지를 값으로 쓴다.
            for (int i = 0; i < token.length(); i++) {
                char ch = token.charAt(i);
                if (seen < need && !Character.isWhitespace(ch) && !Character.isSpaceChar(ch)) { seen++; continue; }
                if (seen >= need) rest.append(ch);
            }
            return finish(best.getAttrNm(), "=", stripQ(rest.toString().trim()), best, sideKind);
        }
        return new Token(token, "=", "", null, List.of(new Issue(Level.ERR, "\"" + token + "\" — 항목명을 인식할 수 없습니다", token, false, null)));
    }

    private static Token finish(String name, String op, String val, QualitySpecAttr attr, String sideKind) {
        List<Issue> issues = new ArrayList<>();
        String finalOp = RANGE.matcher(val).matches() ? "~" : op;
        if (attr == null) issues.add(new Issue(Level.WARN, "\"" + name + "\" — 코드 사전에 없는 항목입니다", name, true, sideKind));
        if (val.isEmpty()) issues.add(Issue.err("\"" + name + "\" — 값이 없습니다"));
        if (attr != null && !QualitySpecAttr.BOTH.equals(attr.getAttrKind()) && !attr.getAttrKind().equals(sideKind)) {
            String where = QualitySpecAttr.COND.equals(sideKind) ? "조건" : "설계결과";
            String orig = QualitySpecAttr.COND.equals(attr.getAttrKind()) ? "조건" : "설계결과";
            issues.add(Issue.warn("\"" + attr.getAttrNm() + "\" 은(는) " + orig + "용 항목인데 " + where + " 영역에 있습니다"));
        }
        return new Token(attr != null ? attr.getAttrNm() : name.trim(), finalOp, val, attr, issues);
    }

    /** 변경 이력·화면 표시용 값: 연산자가 = 이 아니고 ~ 도 아니면 "≥ 20", = 는 "= H36", ~ 는 "0.5~0.8". */
    public static String dispValue(String op, String val) {
        return (op != null && !"~".equals(op) ? op + " " : "") + val;
    }

    /** 설계결과 적용값 표시: = 와 ~ 는 값만, 나머지는 "≥ 20". */
    public static String resultValue(String op, String val) {
        return "=".equals(op) || "~".equals(op) ? val : op + " " + val;
    }
}
