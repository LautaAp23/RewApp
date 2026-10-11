-- Contact email of a person's account. Nullable because the accounts that
-- already exist have none, and NOT unique on purpose: someone who lost their
-- passkey registers again with the same address of mail (docs/PLAN.md §2).
ALTER TABLE "Profile" ADD COLUMN "email" TEXT;
