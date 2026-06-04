/** Bulk order admin routes (extracted from server bootstrap). */
function registerAdminOrdersBulkRoutes(app, deps) {
  const {
    requireAuth,
    requireRole,
    handleBulkOrderStatus,
    handleBulkSoftDeleteOrders
  } = deps;

  app.put('/api/admin/orders/bulk-status', requireAuth, requireRole('ADMIN', 'OWNER'), handleBulkOrderStatus);
  app.post('/api/admin/orders/bulk-delete', requireAuth, requireRole('ADMIN', 'OWNER'), handleBulkSoftDeleteOrders);
  app.delete('/api/admin/orders/bulk-delete', requireAuth, requireRole('ADMIN', 'OWNER'), handleBulkSoftDeleteOrders);
}

module.exports = { registerAdminOrdersBulkRoutes };
