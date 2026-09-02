package com.dongkuk.oasis.service;

import com.dongkuk.oasis.TypedObject;
import com.dongkuk.oasis.context.DefaultServiceContext;
import com.dongkuk.oasis.context.ServiceContext;
import com.dongkuk.oasis.model.Process;
import com.dongkuk.oasis.model.Property;
import com.dongkuk.oasis.utils.TypedMapBuilder;
import org.assertj.core.api.Assertions;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;

import static com.dongkuk.oasis.model.PropertyNames.SERVICE_DTO;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class DtoServiceContextAdapterTest {
    @Test
    void timeDataConverting() {
        Instant now = Instant.now();
        DefaultServiceContext sc = new DefaultServiceContext(new TypedMapBuilder()
                .addEntity("instant", now)
                .build());

        Process p = mock(Process.class);
        when(p.getProperty(SERVICE_DTO)).thenReturn(
                new Property(SERVICE_DTO, "com.dongkuk.oasis.service.DtoServiceContextAdapterTest$SimpleDto"));
        ServiceContext serviceContext = new DtoServiceContextAdapter().adaptServiceInput(sc, p);
        TypedObject simpleDto = serviceContext.get("simpleDto");
        Assertions.assertThat(simpleDto.getObject(SimpleDto.class).getInstant()).isEqualTo(now);
    }

    @ParameterizedTest
    @ValueSource(strings = {"20220615052111,yyyyMMddHHmmss", "2022-06-15 05:21:11,yyyy-MM-dd HH:mm:ss"})
    void stringTimeDataConverting(String dateData) {
        String date = dateData.split(",")[0];
        String format = dateData.split(",")[1];
        LocalDateTime parse = LocalDateTime.parse(date, DateTimeFormatter.ofPattern(format));
        Instant now = parse.atZone(ZoneId.systemDefault()).toInstant();

        DefaultServiceContext sc = new DefaultServiceContext(new TypedMapBuilder()
                .addEntity("instant", date)
                .build());

        Process p = mock(Process.class);
        when(p.getProperty(SERVICE_DTO)).thenReturn(
                new Property(SERVICE_DTO, "com.dongkuk.oasis.service.DtoServiceContextAdapterTest$SimpleDto"));
        ServiceContext serviceContext = new DtoServiceContextAdapter().adaptServiceInput(sc, p);
        TypedObject simpleDto = serviceContext.get("simpleDto");
        Assertions.assertThat(simpleDto.getObject(SimpleDto.class).getInstant()).isEqualTo(now);
    }

    @Test
    void stringToInstantLearning() {
        String date = "20220615052111";
        LocalDateTime parse = LocalDateTime.parse(date, DateTimeFormatter.ofPattern("yyyyMMddHHmmss"));
        System.out.println(parse);
        Instant instant = parse.atZone(ZoneId.systemDefault()).toInstant();
        System.out.println(instant);
        System.out.println(LocalDateTime.ofInstant(instant, ZoneId.systemDefault()));
        System.out.println(ZoneId.systemDefault());
    }

    static class SimpleDto {
        private final Instant instant;

        SimpleDto(Instant instant) {
            this.instant = instant;
        }

        public Instant getInstant() {
            return instant;
        }
    }

}