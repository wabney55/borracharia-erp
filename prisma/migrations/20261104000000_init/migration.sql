CREATE TYPE "UserRole" AS ENUM ('SUPER_ADMIN', 'GENERAL_MANAGER', 'BRANCH_MANAGER', 'ATTENDANT', 'STOCKKEEPER', 'FINANCE');
CREATE TYPE "RecordStatus" AS ENUM ('ACTIVE', 'INACTIVE');
CREATE TYPE "StockMovementType" AS ENUM ('ENTRY', 'SALE', 'WORK_ORDER', 'ADJUSTMENT', 'TRANSFER_OUT', 'TRANSFER_IN', 'RETURN');
CREATE TYPE "TransferStatus" AS ENUM ('DRAFT', 'AWAITING_SHIPMENT', 'IN_TRANSIT', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELED');
CREATE TYPE "WorkOrderStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'WAITING_APPROVAL', 'WAITING_PARTS', 'COMPLETED', 'CANCELED');
CREATE TYPE "SaleStatus" AS ENUM ('COMPLETED', 'CANCELED');
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'PIX', 'DEBIT', 'CREDIT', 'TRANSFER', 'ON_ACCOUNT');
CREATE TYPE "CashRegisterStatus" AS ENUM ('OPEN', 'CLOSED');
CREATE TYPE "FinancialStatus" AS ENUM ('PENDING', 'PARTIAL', 'PAID', 'CANCELED');

CREATE TABLE "Company" (
  "id" UUID NOT NULL,
  "legalName" TEXT NOT NULL,
  "tradeName" TEXT NOT NULL,
  "taxId" TEXT,
  "email" TEXT,
  "phone" TEXT,
  "postalCode" TEXT,
  "street" TEXT,
  "number" TEXT,
  "district" TEXT,
  "city" TEXT,
  "state" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Branch" (
  "id" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "taxId" TEXT,
  "phone" TEXT,
  "manager" TEXT,
  "postalCode" TEXT,
  "street" TEXT,
  "number" TEXT,
  "district" TEXT,
  "city" TEXT,
  "state" TEXT,
  "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
  "isHeadquarters" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "Branch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "User" (
  "id" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "defaultBranchId" UUID,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "role" "UserRole" NOT NULL DEFAULT 'ATTENDANT',
  "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
  "canSeeConsolidated" BOOLEAN NOT NULL DEFAULT false,
  "canApplyDiscount" BOOLEAN NOT NULL DEFAULT false,
  "canCancel" BOOLEAN NOT NULL DEFAULT false,
  "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
  "sessionVersion" INTEGER NOT NULL DEFAULT 1,
  "lastLoginAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UserBranch" (
  "id" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "branchId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserBranch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Customer" (
  "id" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "taxId" TEXT,
  "phone" TEXT,
  "whatsapp" TEXT,
  "email" TEXT,
  "postalCode" TEXT,
  "street" TEXT,
  "number" TEXT,
  "district" TEXT,
  "city" TEXT,
  "state" TEXT,
  "notes" TEXT,
  "isGeneric" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Supplier" (
  "id" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "taxId" TEXT,
  "phone" TEXT,
  "email" TEXT,
  "notes" TEXT,
  "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Category" (
  "id" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Product" (
  "id" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "categoryId" UUID,
  "supplierId" UUID,
  "code" TEXT NOT NULL,
  "barcode" TEXT,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "unit" TEXT NOT NULL DEFAULT 'UN',
  "cost" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "salePrice" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "minimumStock" DECIMAL(12,3) NOT NULL DEFAULT 0,
  "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BranchProductPrice" (
  "id" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "branchId" UUID NOT NULL,
  "productId" UUID NOT NULL,
  "salePrice" DECIMAL(12,2) NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BranchProductPrice_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Service" (
  "id" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "categoryId" UUID,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "price" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Service_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InventoryBalance" (
  "id" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "branchId" UUID NOT NULL,
  "productId" UUID NOT NULL,
  "quantity" DECIMAL(14,3) NOT NULL DEFAULT 0,
  "averageCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InventoryBalance_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StockMovement" (
  "id" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "branchId" UUID NOT NULL,
  "productId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "type" "StockMovementType" NOT NULL,
  "quantity" DECIMAL(14,3) NOT NULL,
  "unitCost" DECIMAL(12,2),
  "originType" TEXT,
  "originId" UUID,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StockTransfer" (
  "id" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "originBranchId" UUID NOT NULL,
  "destinationBranchId" UUID NOT NULL,
  "code" TEXT NOT NULL,
  "status" "TransferStatus" NOT NULL DEFAULT 'DRAFT',
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "shippedAt" TIMESTAMP(3),
  "receivedAt" TIMESTAMP(3),
  CONSTRAINT "StockTransfer_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TransferItem" (
  "id" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "transferId" UUID NOT NULL,
  "productId" UUID NOT NULL,
  "quantity" DECIMAL(14,3) NOT NULL,
  "receivedQuantity" DECIMAL(14,3) NOT NULL DEFAULT 0,
  "unitCost" DECIMAL(12,2),
  CONSTRAINT "TransferItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WorkOrder" (
  "id" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "branchId" UUID NOT NULL,
  "customerId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "number" INTEGER NOT NULL,
  "vehicle" TEXT,
  "problem" TEXT NOT NULL,
  "status" "WorkOrderStatus" NOT NULL DEFAULT 'OPEN',
  "subtotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "discount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "total" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "notes" TEXT,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WorkOrder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WorkOrderItem" (
  "id" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "workOrderId" UUID NOT NULL,
  "productId" UUID,
  "serviceId" UUID,
  "description" TEXT NOT NULL,
  "quantity" DECIMAL(12,3) NOT NULL,
  "unitPrice" DECIMAL(12,2) NOT NULL,
  "total" DECIMAL(12,2) NOT NULL,
  CONSTRAINT "WorkOrderItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Sale" (
  "id" UUID NOT NULL,
  "requestId" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "branchId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "customerId" UUID,
  "number" INTEGER NOT NULL,
  "status" "SaleStatus" NOT NULL DEFAULT 'COMPLETED',
  "subtotal" DECIMAL(12,2) NOT NULL,
  "discount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "total" DECIMAL(12,2) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "canceledAt" TIMESTAMP(3),
  CONSTRAINT "Sale_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SaleItem" (
  "id" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "saleId" UUID NOT NULL,
  "productId" UUID,
  "serviceId" UUID,
  "description" TEXT NOT NULL,
  "quantity" DECIMAL(12,3) NOT NULL,
  "unitPrice" DECIMAL(12,2) NOT NULL,
  "total" DECIMAL(12,2) NOT NULL,
  CONSTRAINT "SaleItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SalePayment" (
  "id" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "saleId" UUID NOT NULL,
  "method" "PaymentMethod" NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "reference" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SalePayment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CashRegister" (
  "id" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "branchId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "status" "CashRegisterStatus" NOT NULL DEFAULT 'OPEN',
  "openingBalance" DECIMAL(12,2) NOT NULL,
  "closingBalance" DECIMAL(12,2),
  "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "closedAt" TIMESTAMP(3),
  CONSTRAINT "CashRegister_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CashMovement" (
  "id" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "branchId" UUID NOT NULL,
  "cashRegisterId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "salePaymentId" UUID,
  "kind" TEXT NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "description" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CashMovement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Payable" (
  "id" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "branchId" UUID NOT NULL,
  "supplierId" UUID,
  "description" TEXT NOT NULL,
  "category" TEXT,
  "amount" DECIMAL(12,2) NOT NULL,
  "dueAt" TIMESTAMP(3) NOT NULL,
  "paidAt" TIMESTAMP(3),
  "status" "FinancialStatus" NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Payable_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Receivable" (
  "id" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "branchId" UUID NOT NULL,
  "customerId" UUID,
  "saleId" UUID,
  "workOrderId" UUID,
  "description" TEXT NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "dueAt" TIMESTAMP(3) NOT NULL,
  "receivedAt" TIMESTAMP(3),
  "status" "FinancialStatus" NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Receivable_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Expense" (
  "id" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "branchId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "description" TEXT NOT NULL,
  "category" TEXT,
  "amount" DECIMAL(12,2) NOT NULL,
  "incurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuditLog" (
  "id" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "branchId" UUID,
  "userId" UUID,
  "action" TEXT NOT NULL,
  "entity" TEXT NOT NULL,
  "entityId" TEXT,
  "details" JSONB,
  "ipAddress" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SystemSetting" (
  "id" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "key" TEXT NOT NULL,
  "value" JSONB NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SystemSetting_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Company_taxId_key" ON "Company"("taxId");
CREATE UNIQUE INDEX "Branch_companyId_id_key" ON "Branch"("companyId", "id");
CREATE UNIQUE INDEX "Branch_companyId_code_key" ON "Branch"("companyId", "code");
CREATE INDEX "Branch_companyId_status_idx" ON "Branch"("companyId", "status");
CREATE UNIQUE INDEX "User_companyId_id_key" ON "User"("companyId", "id");
CREATE UNIQUE INDEX "User_companyId_email_key" ON "User"("companyId", "email");
CREATE INDEX "User_companyId_role_status_idx" ON "User"("companyId", "role", "status");
CREATE UNIQUE INDEX "UserBranch_userId_branchId_key" ON "UserBranch"("userId", "branchId");
CREATE INDEX "UserBranch_companyId_branchId_idx" ON "UserBranch"("companyId", "branchId");
CREATE UNIQUE INDEX "Customer_companyId_id_key" ON "Customer"("companyId", "id");
CREATE UNIQUE INDEX "Customer_companyId_taxId_key" ON "Customer"("companyId", "taxId");
CREATE INDEX "Customer_companyId_name_idx" ON "Customer"("companyId", "name");
CREATE INDEX "Customer_companyId_taxId_idx" ON "Customer"("companyId", "taxId");
CREATE INDEX "Customer_companyId_phone_idx" ON "Customer"("companyId", "phone");
CREATE UNIQUE INDEX "Supplier_companyId_id_key" ON "Supplier"("companyId", "id");
CREATE UNIQUE INDEX "Supplier_companyId_name_key" ON "Supplier"("companyId", "name");
CREATE INDEX "Supplier_companyId_name_idx" ON "Supplier"("companyId", "name");
CREATE UNIQUE INDEX "Category_companyId_name_kind_key" ON "Category"("companyId", "name", "kind");
CREATE UNIQUE INDEX "Category_companyId_id_key" ON "Category"("companyId", "id");
CREATE UNIQUE INDEX "Product_companyId_id_key" ON "Product"("companyId", "id");
CREATE UNIQUE INDEX "Product_companyId_code_key" ON "Product"("companyId", "code");
CREATE UNIQUE INDEX "Product_companyId_barcode_key" ON "Product"("companyId", "barcode");
CREATE INDEX "Product_companyId_name_idx" ON "Product"("companyId", "name");
CREATE INDEX "Product_companyId_barcode_idx" ON "Product"("companyId", "barcode");
CREATE UNIQUE INDEX "BranchProductPrice_branchId_productId_key" ON "BranchProductPrice"("branchId", "productId");
CREATE UNIQUE INDEX "Service_companyId_id_key" ON "Service"("companyId", "id");
CREATE UNIQUE INDEX "Service_companyId_code_key" ON "Service"("companyId", "code");
CREATE UNIQUE INDEX "InventoryBalance_branchId_productId_key" ON "InventoryBalance"("branchId", "productId");
CREATE INDEX "InventoryBalance_companyId_branchId_quantity_idx" ON "InventoryBalance"("companyId", "branchId", "quantity");
CREATE UNIQUE INDEX "StockMovement_originType_originId_productId_type_key" ON "StockMovement"("originType", "originId", "productId", "type");
CREATE INDEX "StockMovement_companyId_branchId_createdAt_idx" ON "StockMovement"("companyId", "branchId", "createdAt");
CREATE INDEX "StockMovement_productId_createdAt_idx" ON "StockMovement"("productId", "createdAt");
CREATE UNIQUE INDEX "StockTransfer_companyId_code_key" ON "StockTransfer"("companyId", "code");
CREATE UNIQUE INDEX "StockTransfer_companyId_id_key" ON "StockTransfer"("companyId", "id");
CREATE INDEX "StockTransfer_companyId_status_createdAt_idx" ON "StockTransfer"("companyId", "status", "createdAt");
CREATE UNIQUE INDEX "TransferItem_transferId_productId_key" ON "TransferItem"("transferId", "productId");
CREATE UNIQUE INDEX "WorkOrder_branchId_number_key" ON "WorkOrder"("branchId", "number");
CREATE UNIQUE INDEX "WorkOrder_companyId_id_key" ON "WorkOrder"("companyId", "id");
CREATE UNIQUE INDEX "WorkOrder_companyId_branchId_id_key" ON "WorkOrder"("companyId", "branchId", "id");
CREATE INDEX "WorkOrder_companyId_branchId_status_createdAt_idx" ON "WorkOrder"("companyId", "branchId", "status", "createdAt");
CREATE UNIQUE INDEX "Sale_branchId_number_key" ON "Sale"("branchId", "number");
CREATE UNIQUE INDEX "Sale_requestId_key" ON "Sale"("requestId");
CREATE UNIQUE INDEX "Sale_companyId_id_key" ON "Sale"("companyId", "id");
CREATE UNIQUE INDEX "Sale_companyId_branchId_id_key" ON "Sale"("companyId", "branchId", "id");
CREATE INDEX "Sale_companyId_branchId_createdAt_idx" ON "Sale"("companyId", "branchId", "createdAt");
CREATE INDEX "CashRegister_companyId_branchId_status_idx" ON "CashRegister"("companyId", "branchId", "status");
CREATE UNIQUE INDEX "CashRegister_companyId_branchId_id_key" ON "CashRegister"("companyId", "branchId", "id");
CREATE UNIQUE INDEX "CashRegister_one_open_per_branch_key" ON "CashRegister"("companyId", "branchId") WHERE "status" = 'OPEN';
CREATE INDEX "CashMovement_companyId_branchId_createdAt_idx" ON "CashMovement"("companyId", "branchId", "createdAt");
CREATE UNIQUE INDEX "SalePayment_companyId_id_key" ON "SalePayment"("companyId", "id");
CREATE INDEX "Payable_companyId_branchId_status_dueAt_idx" ON "Payable"("companyId", "branchId", "status", "dueAt");
CREATE INDEX "Receivable_companyId_branchId_status_dueAt_idx" ON "Receivable"("companyId", "branchId", "status", "dueAt");
CREATE INDEX "Expense_companyId_branchId_incurredAt_idx" ON "Expense"("companyId", "branchId", "incurredAt");
CREATE INDEX "AuditLog_companyId_createdAt_idx" ON "AuditLog"("companyId", "createdAt");
CREATE INDEX "AuditLog_companyId_branchId_createdAt_idx" ON "AuditLog"("companyId", "branchId", "createdAt");
CREATE UNIQUE INDEX "CashMovement_salePaymentId_key" ON "CashMovement"("salePaymentId");
CREATE UNIQUE INDEX "CashMovement_companyId_salePaymentId_key" ON "CashMovement"("companyId", "salePaymentId");
CREATE UNIQUE INDEX "SystemSetting_companyId_key_key" ON "SystemSetting"("companyId", "key");

ALTER TABLE "Branch" ADD CONSTRAINT "Branch_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "User" ADD CONSTRAINT "User_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "User" ADD CONSTRAINT "User_companyId_defaultBranchId_fkey" FOREIGN KEY ("companyId", "defaultBranchId") REFERENCES "Branch"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "UserBranch" ADD CONSTRAINT "UserBranch_companyId_userId_fkey" FOREIGN KEY ("companyId", "userId") REFERENCES "User"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserBranch" ADD CONSTRAINT "UserBranch_companyId_branchId_fkey" FOREIGN KEY ("companyId", "branchId") REFERENCES "Branch"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Category" ADD CONSTRAINT "Category_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Product" ADD CONSTRAINT "Product_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Product" ADD CONSTRAINT "Product_companyId_categoryId_fkey" FOREIGN KEY ("companyId", "categoryId") REFERENCES "Category"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Product" ADD CONSTRAINT "Product_companyId_supplierId_fkey" FOREIGN KEY ("companyId", "supplierId") REFERENCES "Supplier"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BranchProductPrice" ADD CONSTRAINT "BranchProductPrice_companyId_branchId_fkey" FOREIGN KEY ("companyId", "branchId") REFERENCES "Branch"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BranchProductPrice" ADD CONSTRAINT "BranchProductPrice_companyId_productId_fkey" FOREIGN KEY ("companyId", "productId") REFERENCES "Product"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Service" ADD CONSTRAINT "Service_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Service" ADD CONSTRAINT "Service_companyId_categoryId_fkey" FOREIGN KEY ("companyId", "categoryId") REFERENCES "Category"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryBalance" ADD CONSTRAINT "InventoryBalance_companyId_branchId_fkey" FOREIGN KEY ("companyId", "branchId") REFERENCES "Branch"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryBalance" ADD CONSTRAINT "InventoryBalance_companyId_productId_fkey" FOREIGN KEY ("companyId", "productId") REFERENCES "Product"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_companyId_branchId_fkey" FOREIGN KEY ("companyId", "branchId") REFERENCES "Branch"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_companyId_productId_fkey" FOREIGN KEY ("companyId", "productId") REFERENCES "Product"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_companyId_userId_fkey" FOREIGN KEY ("companyId", "userId") REFERENCES "User"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_companyId_originBranchId_fkey" FOREIGN KEY ("companyId", "originBranchId") REFERENCES "Branch"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_companyId_destinationBranchId_fkey" FOREIGN KEY ("companyId", "destinationBranchId") REFERENCES "Branch"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TransferItem" ADD CONSTRAINT "TransferItem_companyId_transferId_fkey" FOREIGN KEY ("companyId", "transferId") REFERENCES "StockTransfer"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TransferItem" ADD CONSTRAINT "TransferItem_companyId_productId_fkey" FOREIGN KEY ("companyId", "productId") REFERENCES "Product"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_companyId_branchId_fkey" FOREIGN KEY ("companyId", "branchId") REFERENCES "Branch"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_companyId_customerId_fkey" FOREIGN KEY ("companyId", "customerId") REFERENCES "Customer"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_companyId_userId_fkey" FOREIGN KEY ("companyId", "userId") REFERENCES "User"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorkOrderItem" ADD CONSTRAINT "WorkOrderItem_companyId_workOrderId_fkey" FOREIGN KEY ("companyId", "workOrderId") REFERENCES "WorkOrder"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorkOrderItem" ADD CONSTRAINT "WorkOrderItem_companyId_productId_fkey" FOREIGN KEY ("companyId", "productId") REFERENCES "Product"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorkOrderItem" ADD CONSTRAINT "WorkOrderItem_companyId_serviceId_fkey" FOREIGN KEY ("companyId", "serviceId") REFERENCES "Service"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_companyId_branchId_fkey" FOREIGN KEY ("companyId", "branchId") REFERENCES "Branch"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_companyId_userId_fkey" FOREIGN KEY ("companyId", "userId") REFERENCES "User"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_companyId_customerId_fkey" FOREIGN KEY ("companyId", "customerId") REFERENCES "Customer"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SaleItem" ADD CONSTRAINT "SaleItem_companyId_saleId_fkey" FOREIGN KEY ("companyId", "saleId") REFERENCES "Sale"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SaleItem" ADD CONSTRAINT "SaleItem_companyId_productId_fkey" FOREIGN KEY ("companyId", "productId") REFERENCES "Product"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SaleItem" ADD CONSTRAINT "SaleItem_companyId_serviceId_fkey" FOREIGN KEY ("companyId", "serviceId") REFERENCES "Service"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SalePayment" ADD CONSTRAINT "SalePayment_companyId_saleId_fkey" FOREIGN KEY ("companyId", "saleId") REFERENCES "Sale"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CashRegister" ADD CONSTRAINT "CashRegister_companyId_branchId_fkey" FOREIGN KEY ("companyId", "branchId") REFERENCES "Branch"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CashRegister" ADD CONSTRAINT "CashRegister_companyId_userId_fkey" FOREIGN KEY ("companyId", "userId") REFERENCES "User"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_companyId_branchId_cashRegisterId_fkey" FOREIGN KEY ("companyId", "branchId", "cashRegisterId") REFERENCES "CashRegister"("companyId", "branchId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_companyId_userId_fkey" FOREIGN KEY ("companyId", "userId") REFERENCES "User"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_companyId_salePaymentId_fkey" FOREIGN KEY ("companyId", "salePaymentId") REFERENCES "SalePayment"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Payable" ADD CONSTRAINT "Payable_companyId_branchId_fkey" FOREIGN KEY ("companyId", "branchId") REFERENCES "Branch"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Payable" ADD CONSTRAINT "Payable_companyId_supplierId_fkey" FOREIGN KEY ("companyId", "supplierId") REFERENCES "Supplier"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Receivable" ADD CONSTRAINT "Receivable_companyId_branchId_fkey" FOREIGN KEY ("companyId", "branchId") REFERENCES "Branch"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Receivable" ADD CONSTRAINT "Receivable_companyId_customerId_fkey" FOREIGN KEY ("companyId", "customerId") REFERENCES "Customer"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Receivable" ADD CONSTRAINT "Receivable_companyId_branchId_saleId_fkey" FOREIGN KEY ("companyId", "branchId", "saleId") REFERENCES "Sale"("companyId", "branchId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Receivable" ADD CONSTRAINT "Receivable_companyId_branchId_workOrderId_fkey" FOREIGN KEY ("companyId", "branchId", "workOrderId") REFERENCES "WorkOrder"("companyId", "branchId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_companyId_branchId_fkey" FOREIGN KEY ("companyId", "branchId") REFERENCES "Branch"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_companyId_userId_fkey" FOREIGN KEY ("companyId", "userId") REFERENCES "User"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_companyId_branchId_fkey" FOREIGN KEY ("companyId", "branchId") REFERENCES "Branch"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_companyId_userId_fkey" FOREIGN KEY ("companyId", "userId") REFERENCES "User"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SystemSetting" ADD CONSTRAINT "SystemSetting_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
