package com.dongkuk.oasis.service;

import com.dongkuk.oasis.context.DefaultServiceContext;
import com.dongkuk.oasis.context.ServiceContext;
import com.dongkuk.oasis.utils.TypedMapBuilder;
import org.assertj.core.api.Assertions;
import org.junit.jupiter.api.Test;

class DefaultDtoGeneratorFromServiceContextTest {
    @Test
    void fullMatchedDto() {
        DtoGeneratorFromServiceContext generator = new DefaultDtoGeneratorFromServiceContext();
        ServiceContext serviceContext = new DefaultServiceContext(
                new TypedMapBuilder()
                        .addEntity("id", 330)
                        .addEntity("no", "3343")
                        .build()
        );

        MyDto myDto = generator.generator(serviceContext, MyDto.class);
        Assertions.assertThat(myDto.getId()).isEqualTo(330);
        Assertions.assertThat(myDto.getNo()).isEqualTo("3343");
    }

    @Test
    void partialMatchedDto() {
        DtoGeneratorFromServiceContext generator = new DefaultDtoGeneratorFromServiceContext();
        ServiceContext serviceContext = new DefaultServiceContext(
                new TypedMapBuilder()
                        .addEntity("no", "3343")
                        .build()
        );

        MyDto myDto = generator.generator(serviceContext, MyDto.class);
        Assertions.assertThat(myDto.getId()).isNull();
        Assertions.assertThat(myDto.getNo()).isEqualTo("3343");
    }

    static class MyDto {
        private Integer id;
        private String no;

        public Integer getId() {
            return id;
        }

        public String getNo() {
            return no;
        }
    }

}