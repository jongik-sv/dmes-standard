CREATE TABLE users
(
    id        integer      NOT NULL,
    first_Name varchar(255) not null,
    last_Name  varchar(255) not null,
    update_Time timestamp,
    rate      number,
    primary key (id)
);
insert into users(id, first_Name, last_Name, update_Time, rate) values(0, 'jeongjin','kim', current_timestamp(), 1.2);
insert into users(id, first_Name, last_Name, update_Time, rate) values(1, 'ji','yun', current_timestamp(), 1.3);
insert into users(id, first_Name, last_Name, update_Time, rate) values(2, 'yuna','park', current_timestamp(), 35.232);