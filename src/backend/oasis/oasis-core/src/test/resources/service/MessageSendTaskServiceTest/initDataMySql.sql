create table users
(
    id            int          not null primary key,
    firstName     varchar(255) not null,
    lastName      varchar(255) not null,
    create_dt     timestamp null,
    enrolled_dt   datetime null,
    account_year year null,
    account_month int null,
    account_date  date null,
    backup_data   blob null
);

insert into users
(id, firstName, lastName, create_dt, enrolled_dt, account_year, account_month, account_date, backup_data)
values (0, 'jeongjin', 'kim', now(), str_to_date('2021-01-01 23:01:11', '%Y-%m-%d %H:%h:%s'), '2021', 1,
        str_to_date('2021-12-01', '%Y-%m-%d'), 123);
insert into users
(id, firstName, lastName, create_dt, enrolled_dt, account_year, account_month, account_date, backup_data)
values (1, 'yuna', 'kim', now(), now(), '2021', 1,
        str_to_date('2021-12-01', '%Y-%m-%d'), 123);
insert into users
(id, firstName, lastName, create_dt, enrolled_dt, account_year, account_month, account_date, backup_data)
values (2, 'sun', 'lee', now(), str_to_date('2021-10-01 01:01:11', '%Y-%m-%d %H:%h:%s'), '2021', 1,
        str_to_date('2021-12-01', '%Y-%m-%d'), 123);