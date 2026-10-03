package com.dongkuk.dmes.cactus.jpa;

import org.hibernate.boot.model.naming.Identifier;
import org.hibernate.boot.model.naming.ImplicitIndexNameSource;
import org.hibernate.boot.model.naming.ImplicitUniqueKeyNameSource;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * cactus 네이밍 전략 특성 테스트 — {@link SnakePhysicalNamingStrategy}, {@link PrefixedSnakePhysicalNamingStrategy},
 * {@link CactusImplicitNamingStrategy} 의 현재 변환 규칙. JdbcEnvironment 는 쓰지 않으므로 null 로 넘긴다.
 */
class NamingStrategyTest {

    private static Identifier id(String text) {
        return new Identifier(text, false);
    }

    @Nested
    class Snake {

        private final SnakePhysicalNamingStrategy s = new SnakePhysicalNamingStrategy();

        private String table(String name) {
            return s.toPhysicalTableName(id(name), null).getText();
        }

        @Test
        void camelCase를_snake_case_소문자로_바꾸고_Entity_접미사를_없앤다() {
            assertThat(table("UserEntity")).isEqualTo("user");
            assertThat(table("userName")).isEqualTo("user_name");
            assertThat(table("MasterCodeItem")).isEqualTo("master_code_item");
        }

        @Test
        void Entity는_접미사가_아니어도_어디서든_지운다() {
            // 현재 동작 (결함 후보): String.replace 라 이름 중간의 "Entity" 도 사라진다.
            assertThat(table("parentEntityId")).isEqualTo("parent_id");
            assertThat(table("EntityType")).isEqualTo("type");
        }

        @Test
        void 소문자_entity는_지우지_않는다() {
            assertThat(table("entity")).isEqualTo("entity");
        }

        @Test
        void 연속_대문자는_밑줄을_넣지_않는다() {
            assertThat(table("userID")).isEqualTo("userid");
            assertThat(table("URLValue")).isEqualTo("urlvalue");
            assertThat(table("ITEM_CD")).isEqualTo("item_cd");
        }

        @Test
        void 점은_밑줄로_바꾼다() {
            assertThat(table("a.bName")).isEqualTo("a_b_name");
        }

        @Test
        void 따옴표_여부를_유지한다() {
            Identifier quoted = s.toPhysicalColumnName(new Identifier("userName", true), null);

            assertThat(quoted.getText()).isEqualTo("user_name");
            assertThat(quoted.isQuoted()).isTrue();
        }

        @Test
        void null은_null이다() {
            assertThat(s.toPhysicalTableName(null, null)).isNull();
            assertThat(s.toPhysicalColumnName(null, null)).isNull();
        }

        @Test
        void 카탈로그_스키마_시퀀스_컬럼에도_같은_규칙을_쓴다() {
            assertThat(s.toPhysicalCatalogName(id("myCatalog"), null).getText()).isEqualTo("my_catalog");
            assertThat(s.toPhysicalSchemaName(id("mySchema"), null).getText()).isEqualTo("my_schema");
            assertThat(s.toPhysicalSequenceName(id("SeqEntity"), null).getText()).isEqualTo("seq");
            assertThat(s.toPhysicalColumnName(id("createdAt"), null).getText()).isEqualTo("created_at");
        }
    }

    @Nested
    class Prefixed {

        private String table(String prefix, String name) {
            return new PrefixedSnakePhysicalNamingStrategy(prefix).toPhysicalTableName(id(name), null).getText();
        }

        @Test
        void snake_변환_뒤에_테이블_prefix를_붙인다() {
            assertThat(table("tb_", "MpnEntity")).isEqualTo("tb_mpn");
            assertThat(table("tb_mpn_", "ItemPlant")).isEqualTo("tb_mpn_item_plant");
        }

        @Test
        void 이미_prefix로_시작하면_붙이지_않는다() {
            assertThat(table("tb_", "TB_ITEM")).isEqualTo("tb_item");
            assertThat(table("tb_mpn_", "tb_mpn_item")).isEqualTo("tb_mpn_item");
        }

        @Test
        void prefix의_첫_구간으로_시작해도_붙이지_않는다() {
            // tb_mpn_ 의 첫 구간 tb_ — cactus 시스템 테이블 이중 prefix 방지
            assertThat(table("tb_mpn_", "TB_SEC_USER")).isEqualTo("tb_sec_user");
        }

        @Test
        void prefix에_밑줄이_없으면_건너뛰기_구간이_없다() {
            assertThat(table("tb", "Item")).isEqualTo("tbitem");
            // 단, 변환 결과가 prefix 자체로 시작하면 붙이지 않는다
            assertThat(table("tb", "tbItem")).isEqualTo("tb_item");
        }

        @Test
        void prefix가_밑줄로_시작하면_건너뛰기_구간이_없다() {
            assertThat(table("_x_", "Item")).isEqualTo("_x_item");
        }

        @Test
        void prefix가_비거나_null이면_부모와_같다() {
            assertThat(table("", "UserEntity")).isEqualTo("user");
            assertThat(table(null, "UserEntity")).isEqualTo("user");
        }

        @Test
        void 컬럼_이름에는_prefix를_붙이지_않는다() {
            PrefixedSnakePhysicalNamingStrategy s = new PrefixedSnakePhysicalNamingStrategy("tb_");

            assertThat(s.toPhysicalColumnName(id("userName"), null).getText()).isEqualTo("user_name");
            assertThat(s.toPhysicalSequenceName(id("mySeq"), null).getText()).isEqualTo("my_seq");
        }

        @Test
        void 따옴표_여부를_유지한다() {
            Identifier r = new PrefixedSnakePhysicalNamingStrategy("tb_")
                    .toPhysicalTableName(new Identifier("Item", true), null);

            assertThat(r.getText()).isEqualTo("tb_item");
            assertThat(r.isQuoted()).isTrue();
        }

        @Test
        void null은_null이다() {
            assertThat(new PrefixedSnakePhysicalNamingStrategy("tb_").toPhysicalTableName(null, null)).isNull();
        }
    }

    @Nested
    class Implicit {

        private ImplicitUniqueKeyNameSource uk(String table, String... cols) {
            ImplicitUniqueKeyNameSource src = mock(ImplicitUniqueKeyNameSource.class);
            when(src.getTableName()).thenReturn(id(table));
            when(src.getColumnNames()).thenReturn(java.util.Arrays.stream(cols).map(NamingStrategyTest::id).toList());
            return src;
        }

        private ImplicitIndexNameSource idx(String table, String... cols) {
            ImplicitIndexNameSource src = mock(ImplicitIndexNameSource.class);
            when(src.getTableName()).thenReturn(id(table));
            when(src.getColumnNames()).thenReturn(java.util.Arrays.stream(cols).map(NamingStrategyTest::id).toList());
            return src;
        }

        @Test
        void UK는_ukPrefix_테이블_컬럼들을_밑줄로_잇는다() {
            CactusImplicitNamingStrategy s = new CactusImplicitNamingStrategy("uk_", "idx_", "");

            assertThat(s.determineUniqueKeyName(uk("mpn", "item_id", "plant_id")).getText())
                    .isEqualTo("uk_mpn_item_id_plant_id");
        }

        @Test
        void 인덱스는_idxPrefix를_쓴다() {
            CactusImplicitNamingStrategy s = new CactusImplicitNamingStrategy("uk_", "idx_", "");

            assertThat(s.determineIndexName(idx("mpn", "item_id")).getText()).isEqualTo("idx_mpn_item_id");
        }

        @Test
        void 테이블_이름이_tablePrefix로_시작하면_떼어낸다() {
            CactusImplicitNamingStrategy s = new CactusImplicitNamingStrategy("uk_", "idx_", "tb_mpn_");

            assertThat(s.determineUniqueKeyName(uk("tb_mpn_item", "code")).getText()).isEqualTo("uk_item_code");
            assertThat(s.determineIndexName(idx("other", "code")).getText()).isEqualTo("idx_other_code");
        }

        @Test
        void prefix가_null이면_빈_문자열로_본다() {
            CactusImplicitNamingStrategy s = new CactusImplicitNamingStrategy(null, null, null);

            assertThat(s.determineUniqueKeyName(uk("mpn", "a")).getText()).isEqualTo("mpn_a");
            assertThat(s.determineIndexName(idx("mpn", "a")).getText()).isEqualTo("mpn_a");
        }

        @Test
        void 대소문자와_snake_변환은_하지_않는다() {
            CactusImplicitNamingStrategy s = new CactusImplicitNamingStrategy("UK_", "IDX_", "");

            assertThat(s.determineUniqueKeyName(uk("MpnItem", "itemId")).getText()).isEqualTo("UK_MpnItem_itemId");
        }

        @Test
        void 컬럼이_없으면_테이블_뒤에_밑줄만_남는다() {
            CactusImplicitNamingStrategy s = new CactusImplicitNamingStrategy("uk_", "idx_", "");

            assertThat(s.determineUniqueKeyName(uk("mpn")).getText()).isEqualTo("uk_mpn_");
        }

        @Test
        void 컬럼_목록은_순서를_지킨다() {
            CactusImplicitNamingStrategy s = new CactusImplicitNamingStrategy("uk_", "idx_", "");

            assertThat(s.determineUniqueKeyName(uk("t", "b", "a")).getText()).isEqualTo("uk_t_b_a");
        }
    }
}
