/**
 * @module community-api
 * @description Typed Convex API references for the community board feature.
 * Uses typed imports from convex/_generated/api for full type safety.
 * @license GPL-3.0-only
 */

import { api } from "../../convex/_generated/api";

export const communityApi = {
  changelog: {
    list: api.communityChangelog.list,
    listPaginated: api.communityChangelog.listPaginated,
    listRecent: api.communityChangelog.listRecent,
    listCount: api.communityChangelog.listCount,
    getByVersion: api.communityChangelog.getByVersion,
    getById: api.communityChangelog.getById,
    create: api.communityChangelog.create,
    update: api.communityChangelog.update,
    remove: api.communityChangelog.remove,
    react: api.communityChangelog.react,
    reactionCounts: api.communityChangelog.reactionCounts,
    myReactions: api.communityChangelog.myReactions,
  },
  items: {
    list: api.communityItems.list,
    get: api.communityItems.get,
    listByStatus: api.communityItems.listByStatus,
    myUpvotes: api.communityItems.myUpvotes,
    create: api.communityItems.create,
    update: api.communityItems.update,
    updateStatus: api.communityItems.updateStatus,
    remove: api.communityItems.remove,
    upvote: api.communityItems.upvote,
  },
  comments: {
    list: api.comments.list,
    create: api.comments.create,
    remove: api.comments.remove,
    count: api.comments.countByTarget,
    countBatch: api.comments.countByTargets,
  },
  contact: {
    submit: api.contactSubmissions.submit,
  },
  profiles: {
    getMyProfile: api.profiles.getMyProfile,
    updateRole: api.profiles.updateRole,
  },
  clientConfig: {
    get: api.clientConfig.getClientConfig,
  },
  aiUsage: {
    checkAndRecord: api.cmdAiUsage.checkAndRecord,
    getRemaining: api.cmdAiUsage.getRemaining,
  },
  plugins: {
    listMine: api.cmdPlugins.listMine,
    getInstallWithPermissions: api.cmdPlugins.getInstallWithPermissions,
    recentEvents: api.cmdPlugins.recentEvents,
    recentCrashes: api.cmdPlugins.recentCrashes,
    recordInstall: api.cmdPlugins.recordInstall,
    grantPermission: api.cmdPlugins.grantPermission,
    revokePermission: api.cmdPlugins.revokePermission,
    setStatus: api.cmdPlugins.setStatus,
    removeInstall: api.cmdPlugins.removeInstall,
    recordEvent: api.cmdPlugins.recordEvent,
  },
};
