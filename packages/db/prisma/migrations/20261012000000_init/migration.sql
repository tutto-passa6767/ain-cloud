-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'MODERATOR', 'SUPPORT', 'ACCOUNTANT', 'ADMIN');

-- CreateEnum
CREATE TYPE "PlanCode" AS ENUM ('FREE', 'PRO', 'PRO_MAX', 'BUSINESS');

-- CreateEnum
CREATE TYPE "Theme" AS ENUM ('DARK', 'LIGHT');

-- CreateEnum
CREATE TYPE "MascotMode" AS ENUM ('ON', 'COLLAPSED', 'OFF');

-- CreateEnum
CREATE TYPE "EmailCodePurpose" AS ENUM ('VERIFY_EMAIL', 'RESET_PASSWORD');

-- CreateEnum
CREATE TYPE "AssetKind" AS ENUM ('VIDEO', 'PHOTO', 'RAW', 'AUDIO', 'DOCUMENT', 'ARCHIVE', 'OTHER');

-- CreateEnum
CREATE TYPE "AssetState" AS ENUM ('UPLOADING', 'RECEIVED', 'CORRUPTED', 'SCANNING', 'VERIFIED', 'RESTRICTED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "ProcessingState" AS ENUM ('NONE', 'PENDING', 'RUNNING', 'READY', 'FAILED', 'UNSUPPORTED');

-- CreateEnum
CREATE TYPE "DerivativeKind" AS ENUM ('THUMB_SM', 'THUMB_LG', 'PREVIEW', 'SPRITE', 'ANIMATED', 'HLS');

-- CreateEnum
CREATE TYPE "UploadStatus" AS ENUM ('ACTIVE', 'COMPLETING', 'COMPLETED', 'ABORTED', 'EXPIRED', 'FAILED');

-- CreateTable
CREATE TABLE "Plan" (
    "code" "PlanCode" NOT NULL,
    "name" TEXT NOT NULL,
    "quotaBytes" BIGINT NOT NULL,
    "maxFileBytes" BIGINT NOT NULL,
    "maxVideoHeight" INTEGER NOT NULL,
    "queuePriority" INTEGER NOT NULL,
    "features" JSONB NOT NULL DEFAULT '{}',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Plan_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerifiedAt" TIMESTAMP(3),
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "planCode" "PlanCode" NOT NULL DEFAULT 'FREE',
    "usedBytes" BIGINT NOT NULL DEFAULT 0,
    "reservedBytes" BIGINT NOT NULL DEFAULT 0,
    "quotaOverride" BIGINT,
    "locale" TEXT NOT NULL DEFAULT 'ru',
    "theme" "Theme" NOT NULL DEFAULT 'DARK',
    "mascotMode" "MascotMode" NOT NULL DEFAULT 'ON',
    "onboardedAt" TIMESTAMP(3),
    "pdConsentAt" TIMESTAMP(3) NOT NULL,
    "failedLogins" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "blockedAt" TIMESTAMP(3),
    "blockedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "ip" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailCode" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "purpose" "EmailCodePurpose" NOT NULL,
    "codeHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Folder" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "parentId" UUID,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "starred" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "trashRootId" UUID,

    CONSTRAINT "Folder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Asset" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "uploadedById" UUID NOT NULL,
    "folderId" UUID,
    "name" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "extension" TEXT NOT NULL,
    "kind" "AssetKind" NOT NULL,
    "detectedMime" TEXT,
    "declaredMime" TEXT,
    "size" BIGINT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "sha256Client" TEXT,
    "sha256" TEXT,
    "state" "AssetState" NOT NULL DEFAULT 'UPLOADING',
    "stateReason" TEXT,
    "stateChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scanEngine" TEXT,
    "processing" "ProcessingState" NOT NULL DEFAULT 'NONE',
    "processingProgress" INTEGER NOT NULL DEFAULT 0,
    "processingError" TEXT,
    "processingAttempts" INTEGER NOT NULL DEFAULT 0,
    "meta" JSONB,
    "exif" JSONB,
    "sensitiveMeta" JSONB,
    "width" INTEGER,
    "height" INTEGER,
    "durationSec" DOUBLE PRECISION,
    "takenAt" TIMESTAMP(3),
    "description" TEXT NOT NULL DEFAULT '',
    "starred" BOOLEAN NOT NULL DEFAULT false,
    "color" TEXT,
    "lastOpenedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "trashRootId" UUID,

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Derivative" (
    "id" UUID NOT NULL,
    "assetId" UUID NOT NULL,
    "kind" "DerivativeKind" NOT NULL,
    "objectKey" TEXT NOT NULL,
    "mime" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "size" BIGINT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Derivative_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetTag" (
    "assetId" UUID NOT NULL,
    "tagId" UUID NOT NULL,

    CONSTRAINT "AssetTag_pkey" PRIMARY KEY ("assetId","tagId")
);

-- CreateTable
CREATE TABLE "UploadSession" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "assetId" UUID NOT NULL,
    "folderId" UUID,
    "s3UploadId" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "size" BIGINT NOT NULL,
    "lastModified" BIGINT NOT NULL,
    "firstPartSha256" TEXT NOT NULL,
    "partSize" INTEGER NOT NULL,
    "partsCount" INTEGER NOT NULL,
    "reservedBytes" BIGINT NOT NULL,
    "status" "UploadStatus" NOT NULL DEFAULT 'ACTIVE',
    "error" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "UploadSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" BIGSERIAL NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorId" UUID,
    "action" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "meta" JSONB,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "EmailCode_userId_purpose_idx" ON "EmailCode"("userId", "purpose");

-- CreateIndex
CREATE INDEX "Folder_ownerId_parentId_idx" ON "Folder"("ownerId", "parentId");

-- CreateIndex
CREATE INDEX "Folder_trashRootId_idx" ON "Folder"("trashRootId");

-- CreateIndex
CREATE INDEX "Folder_name_trgm_idx" ON "Folder" USING GIN ("name" gin_trgm_ops);

-- CreateIndex
CREATE UNIQUE INDEX "Asset_objectKey_key" ON "Asset"("objectKey");

-- CreateIndex
CREATE INDEX "Asset_ownerId_folderId_idx" ON "Asset"("ownerId", "folderId");

-- CreateIndex
CREATE INDEX "Asset_ownerId_createdAt_idx" ON "Asset"("ownerId", "createdAt");

-- CreateIndex
CREATE INDEX "Asset_ownerId_lastOpenedAt_idx" ON "Asset"("ownerId", "lastOpenedAt");

-- CreateIndex
CREATE INDEX "Asset_trashRootId_idx" ON "Asset"("trashRootId");

-- CreateIndex
CREATE INDEX "Asset_state_idx" ON "Asset"("state");

-- CreateIndex
CREATE INDEX "Asset_name_trgm_idx" ON "Asset" USING GIN ("name" gin_trgm_ops);

-- CreateIndex
CREATE UNIQUE INDEX "Derivative_assetId_kind_key" ON "Derivative"("assetId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_ownerId_name_key" ON "Tag"("ownerId", "name");

-- CreateIndex
CREATE INDEX "AssetTag_tagId_idx" ON "AssetTag"("tagId");

-- CreateIndex
CREATE UNIQUE INDEX "UploadSession_assetId_key" ON "UploadSession"("assetId");

-- CreateIndex
CREATE INDEX "UploadSession_userId_status_idx" ON "UploadSession"("userId", "status");

-- CreateIndex
CREATE INDEX "UploadSession_status_expiresAt_idx" ON "UploadSession"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "AuditEvent_actorId_at_idx" ON "AuditEvent"("actorId", "at");

-- CreateIndex
CREATE INDEX "AuditEvent_action_at_idx" ON "AuditEvent"("action", "at");

-- CreateIndex
CREATE INDEX "AuditEvent_targetType_targetId_idx" ON "AuditEvent"("targetType", "targetId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_planCode_fkey" FOREIGN KEY ("planCode") REFERENCES "Plan"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailCode" ADD CONSTRAINT "EmailCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Folder" ADD CONSTRAINT "Folder_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Folder" ADD CONSTRAINT "Folder_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Folder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "Folder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Derivative" ADD CONSTRAINT "Derivative_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tag" ADD CONSTRAINT "Tag_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetTag" ADD CONSTRAINT "AssetTag_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetTag" ADD CONSTRAINT "AssetTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UploadSession" ADD CONSTRAINT "UploadSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UploadSession" ADD CONSTRAINT "UploadSession_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

