create extension if not exists "uuid-ossp";

create table runs (
    id text primary key default uuid_generate_v4(),
    path text[] not null,
    status text not null,
    timeout_ms bigint,
    deadline_epoch_ms bigint, 
    inputs text,
    output text,
    error text,
    parent_run_id text,
    idempotency_key text,
    recovery_attempts bigint not null default 0,
    forked_from_run_id text,

    workflow_name text not null,
    executor_id text,

    queue_name text,
    queue_partition_key text,
    queue_deduplication_id text,

    created_at bigint not null default (extract(epoch from now()) * 1000)::bigint,
    updated_at bigint not null default (extract(epoch from now()) * 1000)::bigint,
    change_id serial, 

    constraint unique_run_status_queue_name_deduplication_id unique (queue_name, queue_deduplication_id)
);

create function run_event_trigger() returns trigger as $$ 
declare
    payload text := new.id || '::' || new.status || '::' || new.change_id;
begin 
    perform pg_notify('helical::runs', payload);
    return new;
end 
$$ language plpgsql;

create trigger runs_trigger after insert or update of status on runs for each row execute function run_event_trigger();

create index runs_created_at on runs (status, created_at);
create index runs_executor_id on runs (executor_id);
create index runs_status on runs (status);
create index runs_forked_from on runs (forked_from_run_id);
create index runs_path on runs using gin (path);

create table operations (
    run_id text not null,
    name text not null,
    sequence_id integer not null,
    output text,
    error text,
    child_run_id text,
    started_at_epoch_ms bigint,
    completed_at_epoch_ms bigint,

    primary key (run_id, sequence_id),
    foreign key (run_id) references runs (id) on update cascade on delete cascade
);

create table messages (
    id text primary key default uuid_generate_v4(),
    destination_run_id text not null,
    type text,
    payload text,
    created_at_epoch_ms bigint not null default (extract(epoch from now()) * 1000)::bigint,

    foreign key (destination_run_id) references runs (id) on update cascade on delete cascade
);

create index messages_destination_run_id on messages (destination_run_id);
create index messages_destination_run_id_type on messages (destination_run_id, type);

create function message_event_trigger() returns trigger as $$ 
declare 
    payload text := new.destination_run_id || '::' || new.type || '::' || new.id;
begin 
    perform pg_notify('helical::messages', payload);
    return new;
end; 
$$ language plpgsql;

create trigger messages_trigger after insert on messages for each row execute function message_event_trigger();

create table state (
    run_id text not null,
    key text not null,
    value text not null,
    change_id serial,

    primary key (run_id, key),
    foreign key (run_id) references runs (id) on update cascade on delete cascade
);

create function state_event_trigger() returns trigger as $$ 
declare 
    payload text := new.run_id || '::' || new.key || '::' || new.change_id;
begin 
    perform pg_notify('helical::state', payload);
    return new;
end; 
$$ language plpgsql;

create trigger state_trigger after insert on state for each row execute function state_event_trigger();

create table state_history (
    run_id text not null,
    sequence_id integer not null,
    key text not null,
    value text not null,
    change_id serial,

    primary key (run_id, sequence_id, key),
    foreign key (run_id) references runs (id) on update cascade on delete cascade
);

