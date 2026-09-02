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
values (0, 'jeongjin', 'kim', now(), PARSEDATETIME('2021-01-01 23:01:11', 'yyyy-MM-dd HH:mm:ss'), '2021', 1,
        PARSEDATETIME('2021-12-01', 'yyyy-MM-dd'));
insert into users
(id, firstName, lastName, create_dt, enrolled_dt, account_year, account_month, account_date)
values (1, 'yuna', 'kim', now(), now(), '2021', 1,
        PARSEDATETIME('2021-12-01', 'yyyy-MM-dd'));
insert into users
(id, firstName, lastName, create_dt, enrolled_dt, account_year, account_month, account_date)
values (2, 'sun', 'lee', now(), PARSEDATETIME('2021-01-01 23:01:11', 'yyyy-MM-dd HH:mm:ss'), '2021', 1,
        PARSEDATETIME('2021-12-01', 'yyyy-MM-dd'));