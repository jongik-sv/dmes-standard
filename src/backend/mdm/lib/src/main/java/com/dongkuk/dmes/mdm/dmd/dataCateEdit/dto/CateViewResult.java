package com.dongkuk.dmes.mdm.dmd.dataCateEdit.dto;

import java.util.List;

/**
 * {@code dataCateEdit} action={@code view}·{@code reg}·{@code save}·{@code delete}·{@code restore} 공용 응답 —
 * 쓰기 액션도 그 카테고리의 새로 고친 상태를 그대로 돌려준다(추가 조회 왕복을 줄인다). TABLE 이고 열려 있을 때만
 * {@code items}(후보, 열린 항목만 R5)·{@code memberCodes}(지금 소속, 열린 항목과 교집합)가 채워진다.
 */
public class CateViewResult {

    /** TABLE 소속 후보 항목 한 줄(코드·이름·lvl1, TransferListPanel 필터용). */
    public static class Item {

        private String code;
        private String name;
        private String lvl1;

        public Item() {
        }

        public Item(String code, String name, String lvl1) {
            this.code = code;
            this.name = name;
            this.lvl1 = lvl1;
        }

        public String getCode() { return code; }
        public String getName() { return name; }
        public String getLvl1() { return lvl1; }

        public void setCode(String v) { this.code = v; }
        public void setName(String v) { this.name = v; }
        public void setLvl1(String v) { this.lvl1 = v; }
    }

    private CateRow cate;
    private List<Item> items;
    private List<String> memberCodes;

    public CateRow getCate() { return cate; }
    public List<Item> getItems() { return items; }
    public List<String> getMemberCodes() { return memberCodes; }

    public void setCate(CateRow v) { this.cate = v; }
    public void setItems(List<Item> v) { this.items = v; }
    public void setMemberCodes(List<String> v) { this.memberCodes = v; }
}
