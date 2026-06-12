import { db } from '@/lib/db';
import crypto from 'crypto';

export async function createAuditLog(params: {
  action: string;
  entityType: string;
  entityId?: string;
  userId?: string;
  userRole?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
}) {
  const logId = `LOG-${Date.now()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
  const dataHash = crypto
    .createHash('sha256')
    .update(JSON.stringify(params))
    .digest('hex');

  return db.auditLog.create({
    data: {
      logId,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      userId: params.userId,
      userRole: params.userRole,
      details: params.details ? JSON.stringify(params.details) : null,
      dataHash,
      ipAddress: params.ipAddress,
    },
  });
}
