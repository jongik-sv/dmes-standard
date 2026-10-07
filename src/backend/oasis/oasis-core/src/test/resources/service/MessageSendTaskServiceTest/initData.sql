create table users
(
    id            int          not null primary key,
    firstName     varchar(255) not null,
    lastName      varchar(255) not null,
    create_dt     timestamp null,
    enrolled_dt   timestamp null,
    account_year int null,
    account_month int null,
    account_date  date null,
    backup_data   blob null
);

insert into users
(id, firstName, lastName, create_dt, enrolled_dt, account_year, account_month, account_date)
values (0, 'jeongjin', 'kim', current_timestamp, TO_TIMESTAMP('2021-01-01 23:01:11', 'YYYY-MM-DD HH24:MI:SS'), 2021, 1,
        TO_DATE('2021-12-01', 'YYYY-MM-DD'));
insert into users
(id, firstName, lastName, create_dt, enrolled_dt, account_year, account_month, account_date)
values (1, 'yuna', 'kim', current_timestamp, current_timestamp, 2021, 1,
        TO_DATE('2021-12-01', 'YYYY-MM-DD'));
insert into users
(id, firstName, lastName, create_dt, enrolled_dt, account_year, account_month, account_date)
values (2, 'sun', 'lee', current_timestamp, TO_TIMESTAMP('2021-01-01 23:01:11', 'YYYY-MM-DD HH24:MI:SS'), 2021, 1,
        TO_DATE('2021-12-01', 'YYYY-MM-DD'));
