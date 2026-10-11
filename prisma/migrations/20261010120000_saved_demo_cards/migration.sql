CREATE TABLE "SavedDemoCard" (
    "id" TEXT NOT NULL,
    "accountAddress" TEXT NOT NULL,
    "demoId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SavedDemoCard_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SavedDemoCard_accountAddress_demoId_key" ON "SavedDemoCard"("accountAddress", "demoId");
