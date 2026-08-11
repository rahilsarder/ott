-- CreateEnum
CREATE TYPE "DeviceAuthStatus" AS ENUM ('PENDING', 'APPROVED', 'DENIED');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "googleId" TEXT,
ALTER COLUMN "passwordHash" DROP NOT NULL;

-- CreateTable
CREATE TABLE "DeviceAuthRequest" (
    "id" TEXT NOT NULL,
    "deviceCodeHash" TEXT NOT NULL,
    "userCode" TEXT NOT NULL,
    "status" "DeviceAuthStatus" NOT NULL DEFAULT 'PENDING',
    "userId" TEXT,
    "lastPolledAt" TIMESTAMP(3),
    "consumedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeviceAuthRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DeviceAuthRequest_deviceCodeHash_key" ON "DeviceAuthRequest"("deviceCodeHash");

-- CreateIndex
CREATE UNIQUE INDEX "DeviceAuthRequest_userCode_key" ON "DeviceAuthRequest"("userCode");

-- CreateIndex
CREATE INDEX "DeviceAuthRequest_expiresAt_idx" ON "DeviceAuthRequest"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");

-- AddForeignKey
ALTER TABLE "DeviceAuthRequest" ADD CONSTRAINT "DeviceAuthRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

