# Helical Workflows

> [!WARNING]  
> This is a work in progress

Simple, typesafe durable workflows without bundler magic

## Features

- Effortless setup
- Effortless deployment
- Automatic workflow recovery
- Messages
- State
- Queues

# Getting started

## Installation

Install the hkit CLI and apply migrations to your Postgres database

```sh
curl -sSfL https://releases.usehelical.com/install.sh | sh
```

Apply migrations to your Postgres instance

```sh
hkit migrate --databaseUrl postgresql://postgres:postgres@localhost:5432/postgres
```

Install the @usehelical/workflows npm package to use it in your project

```sh
pnpm add @usehelical/workflows
```

## Defining a workflow

Define a workflow by using the defineWorkflow function and execute steps by using the runStep function. It is important that the steps you run are idempotent to ensure correct and reliable execution of your workflow.

```ts
import { defineWorkflow, runStep } from '@usehelical/workflows/api';

export const checkoutWorkflow = defineWorkflow('checkout', async (id: string) => {
  await runStep(async () => {
    await decrementInventory();
  });

  await runStep(async () => {
    await createOrder(id);
  });
});
```

## Creating a worker

Create a worker by using the createWorker function registering the workflows it can run. And connecting it to the previously setup Postgres database.

```ts
import { createWorker } from '@usehelical/workflows';

export const worker = createWorker({
  workflows: [checkoutWorkflow],
  options: {
    connectionString: process.env.DATABASE_URL,
  },
});
```

## Starting a worker

Pass the workflow to the runWorkflow function and pass the arguments to the workflow as an array. The waitForResult function will await the workflow completion.

```ts
const { id, getStatus, waitForResult } = await worker.runWorkflow(checkoutWorkflow, [id]);

const { success, data, error } = await waitForResult();
```
