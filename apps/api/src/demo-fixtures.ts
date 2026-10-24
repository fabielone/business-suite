import { PERMISSIONS } from '@suite/core';
import type { Database } from './database.js';

export const DEMO_IDS = {
  business: '10000000-0000-4000-8000-000000000001',
  otherBusiness: '10000000-0000-4000-8000-000000000002',
  manager: '20000000-0000-4000-8000-000000000001',
  worker: '20000000-0000-4000-8000-000000000002',
  otherWorker: '20000000-0000-4000-8000-000000000003',
  outsider: '20000000-0000-4000-8000-000000000004',
  assignedJob: '30000000-0000-4000-8000-000000000001',
  unassignedJob: '30000000-0000-4000-8000-000000000002',
  otherBusinessJob: '30000000-0000-4000-8000-000000000003',
  workerExpense: '40000000-0000-4000-8000-000000000001',
  otherWorkerExpense: '40000000-0000-4000-8000-000000000002',
  otherBusinessExpense: '40000000-0000-4000-8000-000000000003',
} as const;

/** Entirely invented fixtures. Never called by the real server or migrations. */
export async function seedDemo(database: Database): Promise<void> {
  await database.transaction(async (tx) => {
    for (const [id, name] of [
      [DEMO_IDS.manager, 'Alex · demo manager'],
      [DEMO_IDS.worker, 'Sam · demo worker'],
      [DEMO_IDS.otherWorker, 'Taylor · demo worker'],
      [DEMO_IDS.outsider, 'Separate business user'],
    ])
      await tx.query('INSERT INTO suite_users(id,name) VALUES ($1,$2)', [id, name]);
    for (const [id, name] of [
      [DEMO_IDS.business, 'Workshop · sample business'],
      [DEMO_IDS.otherBusiness, 'Isolated sample business'],
    ]) {
      await tx.query('INSERT INTO businesses(id,name) VALUES ($1,$2)', [id, name]);
      for (const module of ['work', 'money']) {
        await tx.query(
          'INSERT INTO business_modules(business_id,module,enabled) VALUES ($1,$2,true)',
          [id, module],
        );
      }
    }
    for (const userId of [DEMO_IDS.manager, DEMO_IDS.worker, DEMO_IDS.otherWorker]) {
      await tx.query('INSERT INTO memberships(business_id,user_id) VALUES ($1,$2)', [
        DEMO_IDS.business,
        userId,
      ]);
    }
    await tx.query('INSERT INTO memberships(business_id,user_id) VALUES ($1,$2)', [
      DEMO_IDS.otherBusiness,
      DEMO_IDS.outsider,
    ]);
    for (const [businessId, actorId] of [
      [DEMO_IDS.business, DEMO_IDS.manager],
      [DEMO_IDS.otherBusiness, DEMO_IDS.outsider],
    ]) {
      for (const permission of PERMISSIONS) {
        await tx.query(
          'INSERT INTO membership_grants(business_id,user_id,permission,scope) VALUES ($1,$2,$3,$4)',
          [businessId, actorId, permission, 'business'],
        );
      }
    }
    for (const userId of [DEMO_IDS.worker, DEMO_IDS.otherWorker]) {
      for (const [permission, scope] of [
        ['work.jobs.read', 'assigned'],
        ['work.jobs.close', 'assigned'],
        ['money.expenses.read', 'own'],
        ['money.expenses.submit', 'own'],
      ]) {
        await tx.query(
          'INSERT INTO membership_grants(business_id,user_id,permission,scope) VALUES ($1,$2,$3,$4)',
          [DEMO_IDS.business, userId, permission, scope],
        );
      }
    }
    for (const [id, businessId, title, customer, price, creator, assignee] of [
      [
        DEMO_IDS.assignedJob,
        DEMO_IDS.business,
        'Install reception sign',
        'Example Studio',
        125000,
        DEMO_IDS.manager,
        DEMO_IDS.worker,
      ],
      [
        DEMO_IDS.unassignedJob,
        DEMO_IDS.business,
        'Inspect workshop lighting',
        'Sample Workshop',
        45000,
        DEMO_IDS.manager,
        DEMO_IDS.otherWorker,
      ],
      [
        DEMO_IDS.otherBusinessJob,
        DEMO_IDS.otherBusiness,
        'Private job in another business',
        'Other Customer',
        90000,
        DEMO_IDS.outsider,
        DEMO_IDS.outsider,
      ],
    ]) {
      await tx.query(
        'INSERT INTO jobs(id,business_id,title,customer_name,agreed_price_minor,created_by) VALUES ($1,$2,$3,$4,$5,$6)',
        [id, businessId, title, customer, price, creator],
      );
      await tx.query('INSERT INTO job_assignments(business_id,job_id,user_id) VALUES ($1,$2,$3)', [
        businessId,
        id,
        assignee,
      ]);
    }
    for (const [id, businessId, jobId, payer, description, amount] of [
      [
        DEMO_IDS.workerExpense,
        DEMO_IDS.business,
        DEMO_IDS.assignedJob,
        DEMO_IDS.worker,
        'Mounting supplies',
        18550,
      ],
      [
        DEMO_IDS.otherWorkerExpense,
        DEMO_IDS.business,
        DEMO_IDS.unassignedJob,
        DEMO_IDS.otherWorker,
        'Inspection supplies',
        8200,
      ],
      [
        DEMO_IDS.otherBusinessExpense,
        DEMO_IDS.otherBusiness,
        DEMO_IDS.otherBusinessJob,
        DEMO_IDS.outsider,
        'Private expense',
        5000,
      ],
    ]) {
      await tx.query(
        'INSERT INTO expenses(id,business_id,job_id,payer_user_id,description,amount_minor,missing_receipt_reason) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [
          id,
          businessId,
          jobId,
          payer,
          description,
          amount,
          'Sample only: paper receipt was not provided.',
        ],
      );
    }
  });
}
