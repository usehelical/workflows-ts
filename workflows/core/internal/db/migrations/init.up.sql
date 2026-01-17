create table workflows (
    workflow_id text primary key,
    status text not null,
    name text not null,
    parent_workflow_id text,

    executor_id text

    input text,
    output text,
    error text,

    created_at bigint not null deafult (extract(epoch from now()) * 1000)::bigint,
    updated_at bigint not null deafult (extract(epoch from now()) * 1000)::bigint,
    started_at_epoch_ms bigint,

    recovery_attempts bigint default 0,
    workflow_timeout_ms bigint,
    workflow_deadline_epoch_ms bigint, 

    owner_xid varchar(40),
    forked_from_workflow_id text,

    queue_name text,
    queue_partition_key text,
    deduplication_id text,
    change_id serial, 
    priority integer not null default 0

    constraint unique_workflow_status_queue_name_deduplication_id unique (queue_name, deduplication_id)
);

create function workflow_events_trigger() returns trigger as $$ 
declare
    payload text := new.workflow_id || '::' || new.status || '::' || new.change_id;
begin 
    perform pg_notify('helical::workflows', payload);
    return new;
end 
$$ language plpgsql;

create trigger workflows_trigger after insert or update of status on workflows for each row execute function workflow_events_trigger();

create index workflows_created_at on workflows (status, created_at);
create index workflows_executor_id on workflows (executor_id);
create index workflows_status on workflows (status);
create index workflows_queue_status_started on workflows (queue_name, status, started_at_epoch_ms);
create index workflow_forked_from on workflows (forked_from_workflow_id);

create table operations (
    workflow_id text not null
    operation_name text not null,
    operation_sequence_id integer not null,
    operation_output text,
    operation_error text,
    operation_child_workflow_id text,
    operation_started_at_epoch_ms bigint,
    operation_completed_at_epoch_ms bigint,

    primary key (workflow_id, operation_sequence_id)
    foreign key (workflow_id) references workflows (workflow_id) on update cascade on delete cascade
);

create table messages (
    message_id text primary key default uuid_generate_v4(),
    destination_workflow_id text not null,
    message_type text,
    message_payload text,
    created_at_epoch_ms bigint not null default (extract(epoch from now()) * 1000)::bigint,

    foreign key (destination_workflow_id) references workflows (workflow_id) on update cascade on delete cascade
);

create index messages_destination_workflow_id on messages (destination_workflow_id);

create trigger messages_trigger after insert on notification for each row execute function message_events_trigger();

create function message_events_trigger() returns trigger as $$ 
declare 
    payload text := new.destination_workflow_id || '::' || new.message_type || '::' || new.message_id
begin 
    perform pg_notify('helical::messages', payload)
    return new
end; 
$$ language plpgsql;

create table state (
    workflow_id text not null,
    key text not null,
    value text not null,
    change_id serial,

    primary key (workflow_id, key)
    foreign key (workflow_id) references workflows (workflow_id) on update cascade on delete cascade
)

create trigger workflow_contexts_trigger after insert on workflow_contexts for each row execute function workflow_contexts_event_trigger()

create function workflow_contexts_event_trigger() returns trigger as $$ 
declare 
    payload text := new.workflow_id || '::' || new.key || '::' || new.change_id
begin 
    perform pg_notify('helical::context', payload)
    return new
end; 
$$ language plpgsql;

create table workflow_context_history (
    workflow_id text not null,
    sequence_id integer not null,
    key text not null,
    value text not null,

    primary key (workflow_id, sequence_id, key)
    foreign key (workflow_id) references workflows (workflow_id) on update cascade on delete cascade
)

