import { WorkflowStatus } from "../../workflow";
import { Database } from "../db/client";

export async function getPendingRuns(db: Database, executorId: string) {
    const runs = await db.selectFrom('runs')
        .where('status', '=', WorkflowStatus.PENDING)
        .where('executor_id', '=', executorId)
        .execute()

    // only take roots from this executorid
    // keep in mind that the workflow can still have a parent with a different executorId
    // check for cancellation of parent run

    return runs.map((r) => ({
        id: r.id,
        path: r.path,
        changeId: r.change_id,
    }))
}