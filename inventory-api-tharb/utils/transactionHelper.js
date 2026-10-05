const mongoose = require('mongoose');

/**
 * Runs a work function with an atomic database transaction if supported by the MongoDB architecture.
 * Standalone MongoDB (Single) does not support multi-document transactions, while Replica Sets and Mongos do.
 */
async function withTransaction(workFn) {
  const top = mongoose.connection?.client?.topology;
  const topologyType = top?.description?.type;
  const isReplica = topologyType === 'ReplicaSetWithPrimary' ||
                    topologyType === 'Sharded' ||
                    Boolean(top?.s?.replicaSet);

  if (!isReplica) {
    return await workFn(null);
  }

  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const result = await workFn(session);
    await session.commitTransaction();
    return result;
  } catch (error) {
    try {
      await session.abortTransaction();
    } catch (_) {}
    throw error;
  } finally {
    session.endSession();
  }
}

module.exports = { withTransaction };
