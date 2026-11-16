-- CreateEnum
CREATE TYPE "Category" AS ENUM ('MAQUIAGEM', 'COMIDA', 'ROUPA', 'OUTRO');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('BAIXA', 'MEDIA', 'ALTA');

-- CreateEnum
CREATE TYPE "ItemStatus" AS ENUM ('PENDENTE', 'COMPRADO');

-- CreateEnum
CREATE TYPE "Origin" AS ENUM ('ELA_PEDIU', 'PEGOU_E_DEVOLVEU', 'ESTAVA_ACABANDO');

-- CreateEnum
CREATE TYPE "PaidWith" AS ENUM ('MEU_DINHEIRO', 'CAIXINHA');

-- CreateTable
CREATE TABLE "Item" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "Category" NOT NULL DEFAULT 'OUTRO',
    "brand" TEXT,
    "notes" TEXT,
    "whereSeen" TEXT,
    "priority" "Priority" NOT NULL DEFAULT 'MEDIA',
    "status" "ItemStatus" NOT NULL DEFAULT 'PENDENTE',
    "origin" "Origin" NOT NULL DEFAULT 'ELA_PEDIU',
    "paidWith" "PaidWith" NOT NULL DEFAULT 'MEU_DINHEIRO',
    "photoUrl" TEXT,
    "photoPublicId" TEXT,
    "purchasedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Item_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Item_status_createdAt_idx" ON "Item"("status", "createdAt");
